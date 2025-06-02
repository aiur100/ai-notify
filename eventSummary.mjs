/**
 * Functions for summarizing multiple events into a concise report
 */
import { callOpenAI } from './openai.mjs';

/**
 * Generates a summary report from multiple events
 * @param {Array} events - Array of events from DynamoDB
 * @param {string} projectName - The project name these events belong to
 * @returns {Promise<Object>} - A formatted Slack message with the summary
 */
export const generateEventSummary = async (events, projectName) => {
  if (!events || events.length === 0) {
    return {
      text: `No events found for project ${projectName}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:information_source: No events found for project *${projectName}*`
          }
        }
      ]
    };
  }

  // Extract event data for the AI prompt
  const eventData = events.map(event => {
    return {
      timestamp: new Date(event.eventTime).toISOString(),
      data: event.data
    };
  });

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

  // Create a prompt for the AI to generate a summary report
  const prompt = `
Create a concise summary report for ${projectName} based on the following ${events.length} events.
The goal is to provide a useful, actionable summary for software engineers.

Event details:
${JSON.stringify(eventData, null, 2)}

Requirements:
1. Use the Slack Block Kit format to create a visually appealing message
2. Group related events and highlight patterns or trends
3. Prioritize the most important information that engineers need to know
4. Keep the report concise and actionable
5. Use appropriate emojis to highlight different types of information
6. Include a brief, relevant conclusion or recommendation if appropriate

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
        json_schema: { name: "generateEventSummary", schema: responseSchema } }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const result = await response.json();
  console.log("Generated summary structure:", JSON.stringify(result.choices[0].message.content, null, 2));
  
  // Parse the response content to get the formatted message
  const formattedMessage = JSON.parse(result.choices[0].message.content);
  
  return formattedMessage;
};

/**
 * Gets the project name from a Slack webhook URL
 * @param {string} webhookUrl - The Slack webhook URL
 * @param {Object} slackChannels - Object mapping channel names to webhook URLs
 * @returns {string} - The project name
 */
export const getProjectNameFromWebhook = (webhookUrl, slackChannels) => {
  // Find the channel name that corresponds to this webhook URL
  const channelEntry = Object.entries(slackChannels).find(([_, url]) => url === webhookUrl);
  
  if (!channelEntry) {
    return 'unknown';
  }
  
  const channelName = channelEntry[0];
  
  // Map channel names to project names
  // This is a simple mapping - you might need to customize this based on your naming conventions
  if (channelName.includes('redline')) return 'redline';
  if (channelName.includes('lymphapress')) return 'lymphapress';
  if (channelName.includes('silo-down')) return 'silo-down';
  if (channelName.includes('pasley-hill')) return 'pasley-hill';
  
  // Default to the channel name if no specific mapping
  return channelName;
};

/**
 * Determines if we should send a summary based on event count
 * @param {Array} events - Array of events from DynamoDB
 * @param {number} threshold - The threshold count to trigger a summary (default: 5)
 * @returns {boolean} - True if we should send a summary
 */
export const shouldSendSummary = (events, threshold = 5) => {
  return events && events.length >= threshold;
};
