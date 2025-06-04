/**
 * Functions for summarizing multiple events into a concise report
 */
import { callOpenAI } from './openai.mjs';
const model = 'o3-2025-04-16';
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
  // Max characters for JSON.stringify(event.data) for a single event
  const MAX_EVENT_DATA_STRING_LENGTH = 3000; 

  const eventData = events.map(event => {
    let dataPayload = event.data.message; // Default to original data
    try {
      const stringifiedData = JSON.stringify(event.data.message);
      if (stringifiedData.length > MAX_EVENT_DATA_STRING_LENGTH) {
        if (typeof event.data.message === 'object' && event.data.message !== null) {
          dataPayload = {
            _summary_note: `Original event data was too large (${stringifiedData.length} chars) and has been truncated. Displaying top-level keys.`,
            _keys: Object.keys(event.data.message).slice(0, 10) // Show first 10 keys
          };
          if (Object.keys(event.data.message).length > 10) {
            dataPayload._keys.push("...and more");
          }
        } else {
          // If not an object (e.g., a very long string), just truncate the string representation
          dataPayload = `Original event data was too large (${stringifiedData.length} chars) and has been truncated: ${stringifiedData.substring(0, MAX_EVENT_DATA_STRING_LENGTH - 100)}... (truncated)`;
        }
      }
    } catch (e) {
      // If stringify fails (e.g. circular refs) or other processing error
      console.warn(`Failed to process or stringify event.data for event at ${new Date(event.eventTime * 1000).toISOString()}: ${e.message}`);
      dataPayload = { 
        _error_note: "Could not process or stringify event data due to an error.", 
        _original_type: typeof event.data.message,
        _error_details: String(e).substring(0,200) // Keep error message concise
      };
    }

    return {
      timestamp: new Date(event.eventTime * 1000).toISOString(),
      data: dataPayload
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
Create a concise, actionable summary for ${projectName} based on ${events.length} recent events that is extremely accurate.

Event data:
${JSON.stringify(eventData, null, 2)}

Guidelines:
1. Consolidate related events - don't list each one separately
2. Focus on the narrative - what's actually happening with the team/project?
3. Highlight only the most important developments, changes, or blockers
4. Be extremely concise - aim for brevity while maintaining clarity
5. Use Slack Block Kit format with appropriate emojis
6. Include actionable insights, only if absolutely necessary.

Your summary should tell the story of recent activity in a way that gives engineers immediate understanding without unnecessary details.

Respond with a JSON object containing:
- 'blocks': An array of Block Kit blocks
- 'text': A plain text fallback message
`;

  // Call OpenAI with structured output format
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
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
 * Generates a single consolidated summary report from multiple partial summary texts.
 * @param {string[]} partialSummaryTexts - Array of text from partial summaries.
 * @param {string} projectName - The project name these summaries belong to.
 * @returns {Promise<Object>} - A formatted Slack message with the consolidated summary.
 */
export const generateConsolidatedSummary = async (partialSummaryTexts, projectName) => {
  if (!partialSummaryTexts || partialSummaryTexts.length === 0) {
    return {
      text: `No partial summaries provided to consolidate for project ${projectName}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:warning: No partial summaries provided to consolidate for project *${projectName}*`
          }
        }
      ]
    };
  }

  // Define the schema for structured output (same as generateEventSummary)
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

  // Create a prompt for the AI to generate a consolidated summary report
  const prompt = `
Project: ${projectName}

The following are several partial summaries generated from different sets of recent events.
Your task is to synthesize these into a SINGLE, COHERENT, ACCURATE, and CONCISE summary.
Avoid redundancy. Focus on the overall narrative and the most important developments.

Partial Summaries:
${partialSummaryTexts.map((text, index) => `--- Partial Summary ${index + 1} ---\n${text}`).join('\n\n')}

Guidelines:
1. Create a unified narrative. Do not just list the partial summaries.
2. Identify overarching themes or critical updates across all partials.
3. Be extremely concise - aim for brevity while maintaining clarity.
4. Use Slack Block Kit format with appropriate emojis.
5. Include actionable insights, only if absolutely necessary.
6. The final output should feel like one single report, not a collection of smaller ones.

Respond with a JSON object containing:
- 'blocks': An array of Block Kit blocks for the consolidated summary.
- 'text': A plain text fallback message for the consolidated summary.
`;

  // Call OpenAI with structured output format
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", 
        json_schema: { name: "generateConsolidatedSummary", schema: responseSchema } }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("OpenAI API error in generateConsolidatedSummary:", JSON.stringify(error, null, 2));
    throw new Error(`OpenAI API error during consolidation: ${error.error?.message || response.statusText}`);
  }

  const result = await response.json();
  console.log("Generated consolidated summary structure:", JSON.stringify(result.choices[0].message.content, null, 2));
  
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
    countThreshold = 20,
    maxAgeSeconds = 7200, // 2 hours
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
