# DynamoDB Table Definition for Event Batching and Summarization

## Table Name: `ProjectEvents`

### Primary Key Structure
- **Partition Key**: `project` (String) - Identifier for the project/team
- **Sort Key**: `eventTime` (Number) - Unix timestamp of when the event was received

### Attributes
- **eventId** (String) - Unique identifier for the event
- **source** (String) - Source of the event (e.g., 'github', 'trello', 'slack')
- **eventData** (Map) - JSON representation of the event data
- **ttl** (Number) - Time-to-live for the record (Unix timestamp)
- **createdAt** (String) - ISO timestamp of when the record was created
- **batchId** (String) - Identifier for the batch
- **processed** (Boolean) - Flag indicating whether the event has been processed

### Global Secondary Indexes

1. **BatchIndex**
   - **Partition Key**: `batchId` (String)
   - **Sort Key**: `eventTime` (Number)
   - **Projected Attributes**: ALL

2. **ProcessingIndex**
   - **Partition Key**: `processed` (Boolean)
   - **Sort Key**: `eventTime` (Number)
   - **Projected Attributes**: ALL

3. **SourceIndex**
   - **Partition Key**: `source` (String)
   - **Sort Key**: `eventTime` (Number)
   - **Projected Attributes**: ALL

## Usage Patterns

### Writing Events
When an event is received from any source (GitHub, Trello, etc.), it is:
1. Parsed to extract key information
2. Assigned to a project based on repository name, board name, or other identifier
3. Stored in the table with appropriate metadata

```javascript
// Example event record
{
  "project": "redline-wholesale",
  "eventTime": 1717517331000,
  "eventId": "gh_pr_123456",
  "source": "github",
  "eventData": {
    "repository": "redline-wholesale/inventory-api",
    "pull_request": {
      "number": 42,
      "title": "Add inventory tracking feature",
      "user": {
        "login": "developer1"
      }
    }
  },
  "createdAt": "2025-06-02T13:37:58Z",
  "ttl": 1720109331 // 30 days from creation
}
```

### Batch Processing Logic

The batch processing agent would:

1. **Trigger Conditions**:
   - Time-based: Process events when the oldest event is older than a threshold (e.g., 1 hour)
   - Count-based: Process events when the number of events for a project exceeds a threshold (e.g., 10 events)

2. **Event Retrieval**:
   - Query the table to find events for a specific project within a time window
   - For each project with events to process:
     - Retrieve all events for that project in the specified time period
     - Generate a batch ID
     - Process the events as a group

3. **Summary Generation**:
   - Pass the batch of events to an AI agent
   - Generate a concise, structured summary of activity
   - Identify key themes, blockers, and achievements
   - Mark events as processed by adding them to a batch

4. **Notification**:
   - Post the summary to the appropriate Slack channel
   - Include links to relevant resources
   - Add interactive elements if needed (e.g., buttons to view details)

## Example Queries

### Get all events for a specific project
```javascript
const params = {
  TableName: 'ProjectEvents',
  KeyConditionExpression: 'project = :p',
  ExpressionAttributeValues: {
    ':p': 'redline-wholesale'
  }
};
```

### Get all events in a specific batch
```javascript
const params = {
  TableName: 'ProjectEvents',
  IndexName: 'BatchIndex',
  KeyConditionExpression: 'batchId = :bid',
  ExpressionAttributeValues: {
    ':bid': 'batch_20250602_1337'
  }
};
```

### Get all events from a specific source
```javascript
const params = {
  TableName: 'ProjectEvents',
  IndexName: 'SourceIndex',
  KeyConditionExpression: 'source = :s',
  ExpressionAttributeValues: {
    ':s': 'github'
  }
};
```

### Get events for a project within a time range
```javascript
const params = {
  TableName: 'ProjectEvents',
  KeyConditionExpression: 'project = :p AND eventTime BETWEEN :start AND :end',
  ExpressionAttributeValues: {
    ':p': 'redline-wholesale',
    ':start': 1717430931000, // 24 hours ago
    ':end': 1717517331000    // now
  }
};
```

## Scaling Considerations

- The table should be provisioned with appropriate read and write capacity units based on expected event volume
- Consider using on-demand capacity mode for unpredictable workloads
- Set appropriate TTL values to automatically remove old events (e.g., 30 days)
- Use batch operations when updating multiple events to reduce consumed capacity

## Integration with Existing System

This DynamoDB table would complement the existing webhook handler by:

1. Storing all incoming events in the table when they are received
2. Running a separate Lambda function on a schedule to check for events that need processing
3. Using the existing OpenAI integration to generate summaries based on batched events
4. Leveraging the existing Slack posting mechanism for delivering the summaries

The system would maintain both the real-time notifications and the periodic summaries, providing both immediate awareness and consolidated updates.

## Implementation Steps

1. Create the DynamoDB table with the defined schema
2. Modify the existing webhook handler to store events in the table
3. Create a new Lambda function to run on a schedule (e.g., every 15 minutes)
4. Implement the batch processing logic to:
   - Identify events that need to be processed
   - Group them by project
   - Generate summaries using OpenAI
   - Post summaries to Slack
5. Add monitoring and alerting to ensure the system is functioning properly
