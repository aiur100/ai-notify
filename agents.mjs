import { callOpenAI } from './openai.mjs';
import fs from 'fs/promises';
import path from 'path';

/**
 * Generates a formatted Slack message using OpenAI based on webhook event data
 * Uses Slack Block Kit to create rich, interactive messages
 * 
 * @param {Object} event - The webhook event object
 * @param {string} source - The source of the webhook ('github', 'trello', or 'unknown')
 * @returns {Promise<Object>} - A formatted message object ready to post to Slack
 */
export const generateSlackMessage = async (event, source) => {
  const eventData = JSON.stringify(event.body || event, null, 2);
  
  const sourceTemplates = {
    'github': 'GitHub event',
    'trello': 'Trello board update',
    'unknown': 'unknown webhook event'
  };
  
  const eventType = sourceTemplates[source] || sourceTemplates.unknown;
  
  // Read the Slack Block Kit documentation to provide context to the AI
  let blockKitDocs = '';
  try {
    blockKitDocs = await fs.readFile(path.join(process.cwd(), 'slack-block-kit-docs.md'), 'utf8');
  } catch (error) {
    console.warn('Could not read Slack Block Kit documentation:', error.message);
    // Continue even if we can't read the docs
  }
  
  // Define the schema for structured output
  const responseSchema = {
    type: "object",
    properties: {
      blocks: {
        type: "array",
        description: "An array of Slack Block Kit blocks to format the message",
        items: {
          type: "object"
        }
      },
      text: {
        type: "string",
        description: "A plain text fallback message for clients that don't support blocks"
      }
    },
    required: ["blocks", "text"]
  };
  
  // Create a prompt for the AI to generate a rich Slack message
  const prompt = `Create a concise, positive Slack message about this ${eventType} using Slack Block Kit formatting.

Event details:
${eventData}

Requirements:
1. Use the Slack Block Kit format to create a visually appealing message
2. Include relevant details that software team members would find useful
3. Use a few meaningful emojis and maintain a fun, positive tone
4. Include a relevant joke or witty comment if appropriate
5. Be creative with the formatting, using appropriate block types

Here's documentation on Slack Block Kit to help you format the message:
${blockKitDocs}

Respond with a JSON object that contains:
- 'blocks': An array of Block Kit blocks
- 'text': A plain text fallback message for clients that don't support blocks`;

  // Call OpenAI with structured output format
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", 
        json_schema: { name: "generateSlackMessage", schema: responseSchema } }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const result = await response.json();
  console.log("Generated Slack message structure:", JSON.stringify(result.choices[0].message.content, null, 2));
  
  // Parse the response content to get the formatted message
  const formattedMessage = JSON.parse(result.choices[0].message.content);
  
  return formattedMessage;
};

/**
 * Determines which Slack channel webhook to use based on event data and source
 * @param {Object} event - The webhook event object
 * @param {string} source - The source of the webhook ('github', 'trello', or 'unknown')
 * @param {Object} slackChannels - Object mapping channel names to webhook URLs
 * @returns {Promise<string>} - The webhook URL to use
 */
export const determineSlackChannel = async (event, source, slackChannels) => {
  if(process.env.TESTING === "true"){
    return slackChannels.bottest;
  }
  // Define the schema for structured output
  const responseSchema = {
    type: "object",
    properties: {
      channel: {
        type: "string",
        description: "The name of the Slack channel to use (must be one of the available channels)",
        enum: Object.keys(slackChannels)
      },
      reasoning: {
        type: "string",
        description: "A brief explanation of why this channel was selected"
      }
    },
    required: ["channel", "reasoning"],
    additionalProperties: false
  };

  // Create a prompt for the AI to determine the channel
  let prompt = `Analyze the following webhook event from ${source} and determine which Slack channel should receive the notification.

Available channels: ${Object.keys(slackChannels).join(', ')}

Event details:
${JSON.stringify(event.body || event, null, 2)}

Based on the content and context of this event, select the most appropriate channel.
Respond with a JSON object that strictly follows this format:
{
  "channel": "[one of: ${Object.keys(slackChannels).join(', ')}]",
  "reasoning": "[brief explanation of why this channel was selected]"
}

The channel must be one of the available channels listed above.`;

  // Call OpenAI with structured output format
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", 
        json_schema: { name: "determineSlackChannel", schema: responseSchema } }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const result = await response.json();
  console.log("OpenAI response:", JSON.stringify(result, null, 2));
  // With json_object format, the content is already a JSON object, no need to parse
  const channelDecision = JSON.parse(result.choices[0].message.content);
  
  // Log the decision for debugging
  console.log(`Channel selected: ${channelDecision.channel}, Reason: ${channelDecision.reasoning}`);
  
  // Return the webhook URL for the selected channel
  const webhookUrl = slackChannels[channelDecision.channel];
  
  if (!webhookUrl) {
    console.warn(`Warning: Selected channel "${channelDecision.channel}" does not have a webhook URL configured`);
    // Fallback to bottest channel if available, otherwise use the first available channel
    return slackChannels.bottest || Object.values(slackChannels)[0];
  }
  
  return webhookUrl;
};