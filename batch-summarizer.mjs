import { callOpenAI } from './openai.mjs';

/**
 * Summarizes a batch of events into a single Slack message
 * @param {Array} events - Array of event objects with event, source, and formattedMessage properties
 * @returns {Promise<Object>} - A formatted message object ready to post to Slack
 */
export const summarizeBatchedEvents = async (events) => {
  if (!events || events.length === 0) {
    throw new Error('No events provided for summarization');
  }

  // If there's only one event, just return its formatted message
  if (events.length === 1) {
    return events[0].formattedMessage;
  }

  // Create a summary of all events for OpenAI to process
  const eventSummaries = events.map((eventObj, index) => {
    const { event, source } = eventObj;
    const eventData = JSON.stringify(event.body || event, null, 2);
    return `Event ${index + 1} (${source}):\n${eventData}\n`;
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

  // Create a prompt for the AI to generate a summary message
  const prompt = `Create a concise, positive Slack message that summarizes these ${events.length} events using Slack Block Kit formatting.

Event summaries:
${eventSummaries.join('\n---\n')}

Requirements:
1. Use the Slack Block Kit format to create a visually appealing message
2. Create a summary that highlights the key points from all events
3. Group similar events together in your summary
4. Use a few meaningful emojis and maintain a fun, positive tone
5. Include a section for each event with brief details
6. Start with a header that indicates this is a batch summary of ${events.length} events

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
        json_schema: { name: "summarizeBatchedEvents", schema: responseSchema } }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const result = await response.json();
  console.log("Generated batch summary structure:", JSON.stringify(result.choices[0].message.content, null, 2));
  
  // Parse the response content to get the formatted message
  const formattedMessage = JSON.parse(result.choices[0].message.content);
  
  return formattedMessage;
};
