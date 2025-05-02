# Pasley Assist

A webhook handler service that processes events from different sources (GitHub, Trello, etc.) and posts formatted notifications to appropriate Slack channels.

## Overview

This service is designed to run as an AWS Lambda function that:

1. Receives webhook events from various sources (GitHub, Trello)
2. Uses OpenAI GPT-4o to generate formatted Slack messages based on event content
3. Determines the appropriate Slack channel based on event content
4. Posts the formatted message to the selected Slack channel using Block Kit

## Project Structure

```
pasley-assist/
├── agents.mjs           # Agent definitions for OpenAI interactions
├── design_docs/         # Project design documentation
│   ├── v1_design.md     # Version 1 design specifications
│   └── v2_design.md     # Version 2 design specifications
├── index.mjs            # Main Lambda handler function
├── logger.mjs           # Logging utility
├── openai.mjs           # OpenAI API integration
├── package.json         # Project dependencies
├── slack-block-kit-docs.md # Slack Block Kit documentation
├── slackRouter.mjs      # Slack message routing logic
├── template.yml         # SAM template for Lambda deployment
├── test/                # Test event data
│   ├── github.json      # Sample GitHub webhook payload
│   └── trello.json      # Sample Trello webhook payload
├── trello.mjs           # Trello webhook handling and API integration
└── zip_lambda.sh        # Script to create a zip package for Lambda deployment
```

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy `env.sample.json` to `env.json` and fill in your API keys and webhook URLs:
   ```
   cp env.sample.json env.json
   ```

## Environment Variables

The following environment variables are required:

- `OPENAI_API_KEY`: Your OpenAI API key
- `REDLINE_CHANNEL_WEBHOOK`: Slack webhook URL for the Redline channel
- `LYMPHAPRESS_CHANNEL_WEBHOOK`: Slack webhook URL for the Lymphapress channel
- `BOT_TEST_CHANNEL_WEBHOOK`: Slack webhook URL for testing
- `ENVIRONMENT`: Deployment environment (e.g., local, dev, prod)
- `TRELLO_KEY`: Your Trello API key
- `TRELLO_TOKEN`: Your Trello API token
- `TRELLO_BOARD_ID`: ID of the Trello board to monitor
- `TRELLO_CALLBACK_URL`: URL for Trello callbacks (your Lambda URL)
- `TESTING`: When set to "true", all notifications are routed to the BOT_TEST_CHANNEL regardless of content

## Deployment to AWS Lambda

### Creating the Deployment Package

Run the provided backup script to create a zip file for Lambda deployment:

```
./zip_lambda.sh
```

This script creates a timestamped zip file containing all necessary code files while excluding:
- `node_modules/` directory (Lambda requires dependencies to be included in the zip)
- `.git/` directory
- `.env` file (environment variables should be configured in Lambda)
- Other unnecessary files

### Important Deployment Notes

1. **Dependencies**: Before creating the deployment zip, ensure all dependencies are installed:
   ```
   npm install
   ```

2. **Lambda Configuration**:
   - Runtime: Node.js 22.x or later
   - Handler: index.handler
   - Memory: 256 MB (minimum recommended)
   - Timeout: 30 seconds (adjust based on needs)
   - URL Configuration: Enable function URL (for webhook endpoints)
   - Response Streaming: Enable (this Lambda uses streamified responses)

3. **Environment Variables**: Configure all required environment variables in the Lambda console

## Local Testing


**REQUIRES AWS SAM CLI INSTALLED**

The project includes sample event data in the `test/` directory for both GitHub and Trello webhooks.

```
sam local invoke MyFunction --event test/trello.json --env-vars env.json
sam local invoke MyFunction --event test/github.json --env-vars env.json
```

For Trello, the service includes functionality to create and manage webhooks for multiple Trello boards. The `trello.mjs` file contains functions to:
- Create webhooks for specific Trello boards
- Fetch board information
- Process webhook events from Trello

## Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request
