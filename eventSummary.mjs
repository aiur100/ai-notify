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
      timestamp: new Date(event.eventTime * 1000).toISOString(), // Convert seconds to milliseconds for Date constructor
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

// getProjectNameFromWebhook function has been moved to projectDetection.mjs

/**
 * Determines if we should send a summary based on event count or time threshold
 * @param {Array} events - Array of events from DynamoDB
 * @param {Object} options - Options for determining when to send a summary
 * @param {number} options.countThreshold - The threshold count to trigger a summary (default: 5)
 * @param {number} options.maxAgeSeconds - The maximum age in seconds before sending a summary regardless of count (default: 540 seconds / 9 minutes)
 * @param {boolean} options.isScheduledCheck - Whether this is a scheduled check (default: false)
 * @returns {boolean} - True if we should send a summary
 */
export const shouldSendSummary = (events, options = {}) => {
  const {
    countThreshold = 5,
    maxAgeSeconds = 540, // 9 minutes
    isScheduledCheck = false
  } = options;
  
  // If there are no events, don't send a summary
  if (!events || events.length === 0) {
    return false;
  }
  
  // If we have enough events, always send a summary
  if (events.length >= countThreshold) {
    return true;
  }
  
  // If this is a scheduled check and we have at least one event, check its age
  if (isScheduledCheck && events.length > 0) {
    // Sort events by eventTime (ascending)
    const sortedEvents = [...events].sort((a, b) => a.eventTime - b.eventTime);
    
    // Get the oldest event
    const oldestEvent = sortedEvents[0];
    
    // Get current time in seconds
    const currentTimeSeconds = Math.floor(Date.now() / 1000);
    
    // Calculate age of the oldest event in seconds
    const oldestEventAgeSeconds = currentTimeSeconds - oldestEvent.eventTime;
    
    // If the oldest event is older than the maxAgeSeconds, send a summary
    if (oldestEventAgeSeconds >= maxAgeSeconds) {
      console.log(`Oldest event is ${oldestEventAgeSeconds} seconds old, exceeding threshold of ${maxAgeSeconds} seconds`);
      return true;
    }
  }
  
  // Otherwise, don't send a summary yet
  return false;
};
