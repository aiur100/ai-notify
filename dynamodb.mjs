import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  DeleteCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: 'us-east-1',
  ...(process.env.IS_LOCAL === 'true' && {
    endpoint: 'http://localhost:8000',
    credentials: {
      accessKeyId: 'LOCAL',
      secretAccessKey: 'LOCAL'
    }
  })
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.EVENT_BATCH_TABLE || 'event-batch-table';
const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || '5', 10);

/**
 * Adds an event to the batch for a specific channel
 * @param {string} channelId - The channel ID to batch events for
 * @param {Object} event - The event to add to the batch
 * @param {string} source - The source of the event (github, trello, etc.)
 * @param {Object} formattedMessage - The formatted message for this event
 * @returns {Promise<Object>} - Information about the batch status
 */
export const addEventToBatch = async (channelId, event, source, formattedMessage) => {
  // Special case: GitHub workflow failures should not be batched
  if (source === 'github' && isWorkflowFailure(event)) {
    console.log('GitHub workflow failure detected - not batching this event');
    return {
      batchComplete: false,
      shouldSendImmediately: true,
      events: [{ event, source, formattedMessage }]
    };
  }

  try {
    // Get the current batch for this channel
    const getResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { channelId }
      })
    );

    const existingBatch = getResult.Item || { 
      channelId,
      events: [],
      ttl: Math.floor(Date.now() / 1000) + 86400 // 24 hours TTL
    };

    // Add the new event to the batch
    existingBatch.events.push({
      id: generateEventId(),
      timestamp: new Date().toISOString(),
      event,
      source,
      formattedMessage
    });

    // Update the last modified time
    existingBatch.lastModified = new Date().toISOString();

    // Save the updated batch
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: existingBatch
      })
    );

    // Check if we've reached the batch size limit
    const batchComplete = existingBatch.events.length >= MAX_BATCH_SIZE;

    // If batch is complete, return all events and clear the batch
    if (batchComplete) {
      const events = existingBatch.events;
      
      // Clear the batch
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { channelId }
        })
      );

      return {
        batchComplete: true,
        events
      };
    }

    return {
      batchComplete: false,
      events: existingBatch.events
    };
  } catch (error) {
    console.error('Error managing event batch:', error);
    // In case of error, return the current event to be processed immediately
    return {
      batchComplete: false,
      shouldSendImmediately: true,
      events: [{ event, source, formattedMessage }]
    };
  }
};

/**
 * Checks if a GitHub event is a workflow failure
 * @param {Object} event - The GitHub event to check
 * @returns {boolean} - True if the event is a workflow failure
 */
function isWorkflowFailure(event) {
  const body = event.body || event;
  
  // Check for workflow_run event with conclusion: failure
  if (body.workflow_run && body.workflow_run.conclusion === 'failure') {
    return true;
  }
  
  // Check for workflow_job event with conclusion: failure
  if (body.workflow_job && body.workflow_job.conclusion === 'failure') {
    return true;
  }
  
  // Check for check_run event with conclusion: failure
  if (body.check_run && body.check_run.conclusion === 'failure') {
    return true;
  }
  
  // Check for action field with 'failed' status
  if (body.action === 'failed' || 
      (body.action && body.action.includes('fail'))) {
    return true;
  }
  
  return false;
}

/**
 * Generates a unique ID for an event
 * @returns {string} - A unique ID
 */
function generateEventId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/**
 * Gets all batched events for all channels
 * @returns {Promise<Object>} - All batched events by channel
 */
export const getAllBatchedEvents = async () => {
  // This would require a scan operation which is not ideal for production
  // For this implementation, we're focusing on the per-channel batching
  console.log('getAllBatchedEvents is not implemented');
  return {};
};

/**
 * Clears all batched events for a channel
 * @param {string} channelId - The channel ID to clear events for
 * @returns {Promise<void>}
 */
export const clearBatchedEvents = async (channelId) => {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { channelId }
      })
    );
  } catch (error) {
    console.error(`Error clearing batched events for channel ${channelId}:`, error);
  }
};
