import { generateSlackMessage, determineSlackChannel } from './agents.mjs';
import { createDynamoClient, storeEvent, getAllProjectEvents, batchDeleteEvents } from './dynamoUtils.mjs';
import { generateEventSummary, getProjectNameFromWebhook, shouldSendSummary } from './eventSummary.mjs';

/**
 * Identifies the source of a webhook event
 * @param {Object} event - The webhook event object
 * @returns {string} - The source of the webhook ('github', 'trello', or 'unknown')
 */
export const identifyWebhookSource = (event) => {
  if (!event || typeof event !== 'object') {
    return 'unknown';
  }
  
  // Check for GitHub specific properties
  if (event.headers?.['x-github-event'] || 
      event.headers?.['X-GitHub-Event'] ||
      event.body?.repository) {
    return 'github';
  }
  
  // Check for Trello specific properties
  if (event.headers?.['x-trello-webhook'] || 
      event.headers?.['X-Trello-Webhook'] ||
      event.body?.action?.idBoard) {
    return 'trello';
  }
  
  return 'unknown';
};

/**
 * Posts a message to Slack using a webhook URL
 * @param {string} webhookUrl - The Slack webhook URL to post to
 * @param {Object} message - The formatted message object to be posted to Slack
 *                         Can include text and/or blocks for rich formatting
 * @returns {Promise<Object>} - The response from the Slack API
 */
export const postToSlack = async (webhookUrl, message) => {
  // If message is a string, convert it to a simple text message object
  const messagePayload = typeof message === 'string' 
    ? { text: message } 
    : message;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(messagePayload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to post to Slack: ${error}`);
  }

  // Slack webhook returns a simple 'ok' text response on success, not JSON
  const responseText = await response.text();
  return { success: true, response: responseText };
};

/**
 * Maps channel names to their corresponding environment variable values
 * @type {Object}
 */
export const slackChannels = {
  'rl-wholesale-redline': process.env.REDLINE_CHANNEL_WEBHOOK,
  'lymphapress-REVO': process.env.LYMPHAPRESS_CHANNEL_WEBHOOK,
  'bottest': process.env.BOT_TEST_CHANNEL_WEBHOOK,
  'pasley hill': process.env.BOT_TEST_CHANNEL_WEBHOOK,
  'silo-down': process.env.SILO_DOWN_CHANNEL_WEBHOOK,
  'silo-down-marketing': process.env.SILO_DOWN_CHANNEL_WEBHOOK,
};

const projectNames = ['redline', 'lymphapress', 'silo-down', 'pasley-hill'];

export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    const source = identifyWebhookSource(event);
    console.log("Webhook source:", source);

    // Start by sending an immediate response
    responseStream.setContentType('application/json');
    responseStream.write(JSON.stringify({ message: "Webhook received, processing started" }));
    responseStream.end();
    
    // Generate the Slack message
    const message = await generateSlackMessage(event, source);
    console.log("Generated message:", message);
    
    // Determine which Slack channel to use
    const webhookUrl = await determineSlackChannel(event, source, slackChannels);
    console.log("Selected webhook URL:", webhookUrl);
    
    // Create DynamoDB client
    const dynamoClient = createDynamoClient({ region: 'us-east-1' });
    
    try {
        // Get project name from webhook URL
        const projectName = getProjectNameFromWebhook(webhookUrl, slackChannels);
        console.log("Project name:", projectName);
        
        // Store the event in DynamoDB
        const storeResult = await storeEvent({
            projectName,
            event: {
                source,
                message,
                originalEvent: event,
                timestamp: new Date().toISOString()
            },
            dynamoClient
        });
        console.log("Stored event in DynamoDB:", storeResult);
        
        // Get all events for this project
        const getResult = await getAllProjectEvents({
            projectName,
            dynamoClient
        });
        console.log(`Retrieved ${getResult.events.length} events for project ${projectName}`);
        
        // Check if we should send a summary (5 or more events)
        if (shouldSendSummary(getResult.events)) {
            console.log(`Generating summary for ${getResult.events.length} events`);
            
            // Generate a summary report
            const summaryMessage = await generateEventSummary(getResult.events, projectName);
            
            // Post the summary to Slack
            const slackResponse = await postToSlack(webhookUrl, summaryMessage);
            console.log("Posted summary to Slack:", slackResponse);
            
            // Delete the processed events from DynamoDB
            const deleteResult = await batchDeleteEvents({
                events: getResult.events,
                dynamoClient
            });
            console.log("Deleted processed events:", deleteResult);
        } else {
            // Not enough events for a summary yet, just log the count
            console.log(`Only ${getResult.events.length} events for ${projectName}, not sending summary yet`);
        }
    } catch (error) {
        console.error("Error processing event:", error);
        
        // If there's an error, still try to post the original message to Slack as a fallback
        try {
            const slackResponse = await postToSlack(webhookUrl, message);
            console.log("Posted original message to Slack as fallback:", slackResponse);
        } catch (slackError) {
            console.error("Error posting to Slack:", slackError);
        }
    }
});