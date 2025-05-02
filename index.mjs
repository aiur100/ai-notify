import { callOpenAI } from './openai.mjs';
import { generateSlackMessage, determineSlackChannel } from './agents.mjs';
import { addEventToBatch, clearBatchedEvents } from './dynamodb.mjs';
import { summarizeBatchedEvents } from './batch-summarizer.mjs';

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
  'lymphapress': process.env.LYMPHAPRESS_CHANNEL_WEBHOOK,
  'bottest': process.env.BOT_TEST_CHANNEL_WEBHOOK,
};

export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    const source = identifyWebhookSource(event);
    console.log("Webhook source:", source);

    // Start by sending an immediate response
    responseStream.setContentType('application/json');
    responseStream.write(JSON.stringify({ message: "Webhook received, processing started" }));
    responseStream.end();
    
    // Generate the Slack message for this individual event
    const message = await generateSlackMessage(event, source);
    console.log("Generated message:", message);
    
    // Determine which Slack channel to use
    const webhookUrl = await determineSlackChannel(event, source, slackChannels);
    console.log("Selected webhook URL:", webhookUrl);
    
    // Find the channel name from the webhook URL
    const channelName = Object.keys(slackChannels).find(key => slackChannels[key] === webhookUrl) || 'unknown';
    
    try {
        // Add this event to the batch for this channel
        const batchResult = await addEventToBatch(channelName, event, source, message);
        console.log("Batch result:", batchResult);
        
        // If this is a GitHub workflow failure or there's an error, send immediately
        if (batchResult.shouldSendImmediately) {
            console.log("Sending event immediately (workflow failure or error)");
            const slackResponse = await postToSlack(webhookUrl, message);
            console.log("Posted individual event to Slack:", slackResponse);
            return;
        }
        
        // If we've reached the batch size limit, send the batch
        if (batchResult.batchComplete) {
            console.log(`Batch complete for channel ${channelName}, sending summary of ${batchResult.events.length} events`);
            
            // Generate a summary message for all events in the batch
            const batchSummary = await summarizeBatchedEvents(batchResult.events);
            console.log("Generated batch summary:", batchSummary);
            
            // Post the summary to Slack
            const slackResponse = await postToSlack(webhookUrl, batchSummary);
            console.log("Posted batch summary to Slack:", slackResponse);
        } else {
            console.log(`Added event to batch for channel ${channelName}. Current batch size: ${batchResult.events.length}`);
        }
    } catch (error) {
        console.error("Error in event batching or posting to Slack:", error);
        
        // Fallback: post the individual message directly
        try {
            const slackResponse = await postToSlack(webhookUrl, message);
            console.log("Posted to Slack (fallback):", slackResponse);
        } catch (slackError) {
            console.error("Error posting to Slack (fallback):", slackError);
        }
    }
});