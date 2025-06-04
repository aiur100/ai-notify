# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Local Testing
```bash
# Test with sample GitHub event
sam local invoke MyFunction --event test/github.json --env-vars env.json

# Test with sample Trello event  
sam local invoke MyFunction --event test/trello.json --env-vars env.json

# Test scheduled event (for batch processing)
sam local invoke MyFunction --event test/sampleEvent.json --env-vars env.json
```

### Deployment
```bash
# Create deployment package
./zip_lambda.sh

# Deploy to AWS Lambda (requires aws-cli and profile setup)
./deploy_lambda.sh

# Update environment variables
./update_lambda_env.sh

# Create scheduled event for batch processing
./create_scheduled_event.sh
```

### Testing DynamoDB utilities
```bash
node test/testDynamoUtils.mjs
```

## Architecture Overview

This is an AWS Lambda-based webhook handler that:

1. **Receives webhook events** from GitHub, Trello, and other sources
2. **Stores events in DynamoDB** (`team-events` table) by project name
3. **Batches events** and generates AI-powered summaries when thresholds are met
4. **Routes notifications** to appropriate Slack channels based on project detection
5. **Supports scheduled processing** for events older than 9 minutes

### Key Components

- **Main Handler** (`index.mjs`): Streamified Lambda handler with dual modes:
  - Webhook processing: Store events and check for summary triggers  
  - Scheduled processing: Check all projects for events ready to summarize

- **Event Storage** (`dynamoUtils.mjs`): DynamoDB operations with 24-hour TTL
  - Partition key: `projectName` 
  - Sort key: `eventTime` (unix timestamp in seconds)

- **AI Agents** (`agents.mjs`): OpenAI GPT-4o integration for:
  - Generating formatted Slack messages using Block Kit
  - Determining appropriate Slack channels based on content

- **Project Detection** (`projectDetection.mjs`): Content analysis to identify projects:
  - `redline` (automotive)
  - `lymphapress` (REVO/compression therapy) 
  - `silo-down` (marketing)
  - `pasley-hill` (consulting)

- **Event Summary** (`eventSummary.mjs`): Batch processing logic:
  - Triggers on 3+ events OR events older than 9 minutes
  - Generates comprehensive summaries with AI

### Environment Variables

Required in `env.json` for local testing and Lambda configuration:
- `OPENAI_API_KEY`: For AI message generation
- `REDLINE_CHANNEL_WEBHOOK`, `LYMPHAPRESS_CHANNEL_WEBHOOK`, etc.: Slack webhook URLs
- `TESTING`: Set to "true" to route all messages to `BOT_TEST_CHANNEL`
- `TRELLO_KEY`, `TRELLO_TOKEN`, `TRELLO_BOARD_ID`: For Trello integration

### Lambda Configuration

- Runtime: Node.js 22.x
- Handler: `index.handler`
- Memory: 256 MB minimum 
- Timeout: 30 seconds
- Function URL: Enabled for webhook endpoints
- Response Streaming: Enabled (uses `awslambda.streamifyResponse`)

### DynamoDB Table Schema

Table: `team-events`
- Partition Key: `projectName` (string)
- Sort Key: `eventTime` (number, unix timestamp in seconds)
- TTL: `ttl` attribute (24 hours from creation)
- Attributes: `data` (event payload), `ttl`

### Webhook Sources Supported

- **GitHub**: Detected via `x-github-event` header or `repository` in body
- **Trello**: Detected via `x-trello-webhook` header or `action.idBoard` in body
- **Generic**: Falls back to "unknown" source type

### Scheduled Processing

Events are processed in batches when:
- 3 or more events exist for a project, OR
- Events are older than 9 minutes (scheduled check via EventBridge)

The scheduled check processes all project types: `redline`, `lymphapress`, `silo-down`, `pasley-hill`.