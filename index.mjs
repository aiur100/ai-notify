import { generateSlackMessage, determineSlackChannel } from './agents.mjs';
import { createDynamoClient, storeEvent, getAllProjectEvents, batchDeleteEvents } from './dynamoUtils.mjs';
import { generateEventSummary, shouldSendSummary, generateConsolidatedSummary } from './eventSummary.mjs';
import { determineProjectName } from './projectDetection.mjs';

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

/**
 * Processes events for a single project
 * @param {Object} params - Processing parameters
 * @param {string} params.projectName - The project name to process
 * @param {string} params.webhookUrl - The Slack webhook URL for this project
 * @param {Object} params.dynamoClient - DynamoDB Document Client
 * @param {boolean} params.isScheduledCheck - Whether this is a scheduled check
 * @returns {Promise<Object>} - Processing result
 */
async function processProjectEvents({ projectName, webhookUrl, dynamoClient, isScheduledCheck = false }) {
    console.log(`Processing events for project: ${projectName}, scheduled check: ${isScheduledCheck}`);

    const getResult = await getAllProjectEvents({
        projectName,
        dynamoClient
    });
    console.log(`Retrieved ${getResult.events.length} events for project ${projectName}`);

    const allEvents = getResult.events;

    // If this is NOT a scheduled check, log and exit. Events are already stored by the main handler.
    // Summaries are only sent during scheduled checks.
    if (!isScheduledCheck) {
        console.log(`Event-triggered invocation for project ${projectName}. Events stored. No summary will be sent now.`);
        return {
            success: true,
            action: 'event_stored_no_summary_sent_on_direct_invocation',
            eventCount: allEvents.length // This might be 0 if the event was the first for the project
        };
    }

    // If it IS a scheduled check, but there are no events, then do nothing.
    if (allEvents.length === 0) { // This condition is specifically for isScheduledCheck === true
        console.log(`No events to process for project ${projectName}.`);
        return {
            success: true,
            action: 'no_events_to_process',
            eventCount: 0
        };
    }

    const MAX_EVENTS_PER_CHUNK = process.env.MAX_EVENTS_PER_CHUNK ? parseInt(process.env.MAX_EVENTS_PER_CHUNK) : 15;

    // For scheduled checks, if we have events, we always proceed to summarize and send.
    // The shouldSendSummary logic is effectively superseded by the isScheduledCheck and allEvents.length > 0 checks.
    // The original 'else' for shouldSendSummary (threshold not met) is removed because
    // non-scheduled checks return early, and scheduled checks with events always proceed.
    console.log(`Scheduled check: Processing ${allEvents.length} events for ${projectName}. Chunking (max ${MAX_EVENTS_PER_CHUNK} per chunk) to create a single consolidated summary.`);
        console.log(`Need to process ${allEvents.length} events for ${projectName}. Chunking (max ${MAX_EVENTS_PER_CHUNK} per chunk) to create a single consolidated summary.`);

        const partialSummaryTexts = [];
        let eventsProcessedInChunks = 0;
        let chunkErrors = 0;

        for (let i = 0; i < allEvents.length; i += MAX_EVENTS_PER_CHUNK) {
            const chunk = allEvents.slice(i, i + MAX_EVENTS_PER_CHUNK);
            const chunkNumber = Math.floor(i / MAX_EVENTS_PER_CHUNK) + 1;
            const totalChunks = Math.ceil(allEvents.length / MAX_EVENTS_PER_CHUNK);

            console.log(`Generating partial summary for chunk ${chunkNumber}/${totalChunks} (${chunk.length} events) for project ${projectName}`);

            try {
                if (i > 0) await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay

                const partialSummaryMessage = await generateEventSummary(chunk, projectName);
                // We'll use the 'text' field for consolidation. If 'blocks' are preferred, this logic would need adjustment.
                if (partialSummaryMessage && partialSummaryMessage.text) {
                    partialSummaryTexts.push(partialSummaryMessage.text);
                }
                eventsProcessedInChunks += chunk.length;
            } catch (error) {
                console.error(`Error generating partial summary for chunk ${chunkNumber}/${totalChunks} for project ${projectName}: ${error.message}`, error.stack);
                chunkErrors++;
                // Decide if we want to stop or continue. For now, let's try to continue and summarize what we can.
            }
        }

        console.log(`Finished generating partial summaries. ${partialSummaryTexts.length} partial summaries created. ${chunkErrors} chunk(s) failed.`);

        if (partialSummaryTexts.length === 0 && allEvents.length > 0) {
            console.error(`No partial summaries were generated for ${projectName}, though there were events. Cannot proceed to final summary.`);
            return {
                success: false,
                action: 'all_chunks_failed_to_summarize',
                eventCount: allEvents.length,
                processedInChunks: eventsProcessedInChunks,
                chunkErrors: chunkErrors
            };
        }
        
        if (partialSummaryTexts.length === 0 && allEvents.length === 0) { // Should be caught by earlier check but good to have
             console.log(`No events and no partial summaries for ${projectName}.`);
             return { success: true, action: 'no_events_to_process', eventCount: 0 };
        }

        try {
            let finalSummaryMessage;
            if (partialSummaryTexts.length === 1 && chunkErrors === 0) {
                // If only one chunk was successfully processed, and it was the only one, its summary is the final summary.
                // We need to re-fetch the full message object if we only stored text.
                // For simplicity now, let's assume generateEventSummary would be called again, or we'd need to store the full object.
                // Re-generating for now to ensure we get the full block structure for a single successful chunk.
                // This assumes the first (and only) chunk was allEvents if length is 1.
                console.log(`Only one partial summary generated, using it as the final summary for ${projectName}.`);
                finalSummaryMessage = await generateEventSummary(allEvents.slice(0, MAX_EVENTS_PER_CHUNK), projectName);
            } else {
                console.log(`Generating consolidated summary from ${partialSummaryTexts.length} partial summaries for ${projectName}.`);
                // This function will need to be created in eventSummary.mjs
                finalSummaryMessage = await generateConsolidatedSummary(partialSummaryTexts, projectName);
            }

            console.log(`Posting final consolidated summary to Slack for ${projectName}.`);
            const slackResponse = await postToSlack(webhookUrl, finalSummaryMessage);
            console.log("Posted final summary to Slack:", slackResponse);

            console.log(`Deleting all ${allEvents.length} processed events from DynamoDB for ${projectName}.`);
            const deleteResult = await batchDeleteEvents({
                events: allEvents, // Delete all original events
                dynamoClient
            });
            console.log("Deleted all processed events:", deleteResult);

            return {
                success: true,
                action: 'consolidated_summary_sent',
                eventCount: allEvents.length,
                partialSummariesCount: partialSummaryTexts.length,
                chunkErrors: chunkErrors
            };

        } catch (error) {
            console.error(`Error in final summary generation or posting for project ${projectName}: ${error.message}`, error.stack);
            // Events are NOT deleted in this case
            return {
                success: false,
                action: 'final_summary_processing_failed',
                eventCount: allEvents.length,
                partialSummariesCount: partialSummaryTexts.length,
                chunkErrors: chunkErrors,
                error: error.message
            };
        }

}

/**
 * Checks if an event is a scheduled check event
 * @param {Object} event - The Lambda event
 * @returns {boolean} - True if this is a scheduled check event
 */
function isScheduledCheckEvent(event) {
    // Check if this is an EventBridge scheduled event
    if (event.source === 'aws.events' && event['detail-type'] === 'Scheduled Event') {
        return true;
    }
    
    // Check for our custom scheduled check flag
    if (event.isScheduledCheck === true) {
        return true;
    }
    
    return false;
}

export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    // Start by sending an immediate response
    responseStream.setContentType('application/json');
    responseStream.write(JSON.stringify({ message: "Webhook received, processing started" }));
    responseStream.end();
    
    // Create DynamoDB client
    const dynamoClient = createDynamoClient({ region: 'us-east-1' });
    
    // Check if this is a scheduled check event
    const isScheduledCheck = isScheduledCheckEvent(event);
    console.log("Is scheduled check:", isScheduledCheck);
    
    if (isScheduledCheck) {
        // Process all projects for scheduled check
        console.log("Running scheduled check for all projects");
        
        const results = {};
        
        // Process each project
        for (const projectName of projectNames) {
            try {
                // Find the webhook URL for this project
                // Look for exact matches first, then partial matches
                let channelKey = Object.keys(slackChannels).find(key => key === projectName);
                
                // If no exact match, try partial match
                if (!channelKey) {
                    channelKey = Object.keys(slackChannels).find(key => key.includes(projectName));
                }
                
                // If still no match, try looking for the project name in the channel key
                if (!channelKey) {
                    channelKey = Object.keys(slackChannels).find(key => projectName.includes(key));
                }
                
                if (!channelKey) {
                    console.log(`No webhook URL found for project ${projectName}, skipping`);
                    continue;
                }
                
                const webhookUrl = slackChannels[channelKey];
                console.log(`Using channel ${channelKey} for project ${projectName}`);
                
                // Process events for this project
                const result = await processProjectEvents({
                    projectName,
                    webhookUrl,
                    dynamoClient,
                    isScheduledCheck: true
                });
                
                results[projectName] = result;
            } catch (error) {
                console.error(`Error processing project ${projectName}:`, error);
                results[projectName] = { success: false, error: error.message };
            }
        }
        
        console.log("Scheduled check results:", results);
        return;
    }
    
    // Regular webhook event processing
    const source = identifyWebhookSource(event);
    console.log("Webhook source:", source);
    
    // Generate the Slack message
    const message = await generateSlackMessage(event, source);
    console.log("Generated message:", message);
    
    // Determine which Slack channel to use
    const webhookUrl = await determineSlackChannel(event, source, slackChannels);
    console.log("Selected webhook URL:", webhookUrl);
    
    try {
        // Get project name by analyzing both event content and webhook URL
        const projectName = determineProjectName(event, source, webhookUrl, slackChannels);
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
        
        // Process events for this project
        await processProjectEvents({
            projectName,
            webhookUrl,
            dynamoClient,
            isScheduledCheck: false
        });
    } catch (error) {
        console.trace(error);
        console.error("Error processing event:", error);
    }
});