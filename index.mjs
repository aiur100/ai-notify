import { generateSlackMessage, determineSlackChannel } from './agents.mjs';

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
    
    // Post to the determined Slack channel
    try {
        const slackResponse = await postToSlack(webhookUrl, message);
        console.log("Posted to Slack:", slackResponse);
    } catch (error) {
        console.error("Error posting to Slack:", error);
    }
    
});