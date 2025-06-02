/**
 * DynamoDB utility functions for team-events table
 * Uses AWS SDK v3 with Document Client
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Creates a configured DynamoDB Document Client
 * @param {Object} options - Configuration options
 * @param {string} [options.profile] - AWS profile name (e.g., 'pasley_hill')
 * @returns {Object} - Configured DynamoDB Document Client
 */
export function createDynamoClient(options = {}) {
  const clientOptions = {
    region: options.region || 'us-east-1' // Default to us-east-1 if not specified
  };
  
  // If profile is provided, configure credentials to use that profile
  if (options.profile) {
    // Set the profile in the environment
    process.env.AWS_PROFILE = options.profile;
  }
  
  const client = new DynamoDBClient(clientOptions);
  return DynamoDBDocumentClient.from(client);
}

/**
 * Store an event in the team-events table
 * @param {Object} params - Parameters for storing the event
 * @param {string} params.projectName - Project identifier (partition key)
 * @param {Object} params.event - Event data to store
 * @param {Object} [params.dynamoClient] - DynamoDB Document Client (optional)
 * @returns {Promise<Object>} - Result from DynamoDB
 */
export async function storeEvent({ projectName, event, dynamoClient }) {
  // Use provided client or create a default one
  const docClient = dynamoClient || createDynamoClient({ profile: 'pasley_hill', region: 'us-east-1' });
  
  // Current time in milliseconds (unix timestamp)
  const currentTime = Date.now();
  
  // TTL set to 10 minutes from now (in seconds)
  const ttl = Math.floor(currentTime / 1000) + (10 * 60);
  
  const params = {
    TableName: 'team-events',
    Item: {
      projectName, // Partition key
      eventTime: currentTime, // Sort key
      data: event, // Store the event data as a map
      ttl // TTL attribute for automatic deletion
    }
  };
  
  try {
    const command = new PutCommand(params);
    const result = await docClient.send(command);
    return {
      success: true,
      result,
      timestamp: currentTime
    };
  } catch (error) {
    console.error('Error storing event:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get all events for a specific project
 * @param {Object} params - Parameters for retrieving events
 * @param {string} params.projectName - Project identifier to query
 * @param {Object} [params.dynamoClient] - DynamoDB Document Client (optional)
 * @returns {Promise<Array>} - Array of events for the project
 */
export async function getAllProjectEvents({ projectName, dynamoClient }) {
  // Use provided client or create a default one
  const docClient = dynamoClient || createDynamoClient({ profile: 'pasley_hill', region: 'us-east-1' });
  
  const params = {
    TableName: 'team-events',
    KeyConditionExpression: 'projectName = :projectName',
    ExpressionAttributeValues: {
      ':projectName': projectName
    },
    ScanIndexForward: false // Return items in descending order (newest first)
  };
  
  try {
    const command = new QueryCommand(params);
    const result = await docClient.send(command);
    return {
      success: true,
      events: result.Items || []
    };
  } catch (error) {
    console.error('Error retrieving project events:', error);
    return {
      success: false,
      error: error.message,
      events: []
    };
  }
}

/**
 * Batch delete multiple events from the team-events table
 * @param {Object} params - Parameters for batch deletion
 * @param {Array} params.events - Array of events to delete, each must have projectName and eventTime
 * @param {Object} [params.dynamoClient] - DynamoDB Document Client (optional)
 * @returns {Promise<Object>} - Result of the batch delete operation
 */
export async function batchDeleteEvents({ events, dynamoClient }) {
  // Use provided client or create a default one
  const docClient = dynamoClient || createDynamoClient({ profile: 'pasley_hill', region: 'us-east-1' });
  
  // DynamoDB BatchWrite can process up to 25 items at a time
  const BATCH_SIZE = 25;
  const results = [];
  
  // Process events in batches
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    
    // Create delete requests for each event in the batch
    const deleteRequests = batch.map(event => {
      // Each event must have projectName and eventTime for the key
      if (!event.projectName || !event.eventTime) {
        throw new Error(`Event at index ${i} is missing required keys (projectName and eventTime)`);
      }
      
      return {
        DeleteRequest: {
          Key: {
            projectName: event.projectName,
            eventTime: event.eventTime
          }
        }
      };
    });
    
    const params = {
      RequestItems: {
        'team-events': deleteRequests
      }
    };
    
    try {
      const command = new BatchWriteCommand(params);
      const result = await docClient.send(command);
      results.push({
        success: true,
        batchSize: batch.length,
        result
      });
    } catch (error) {
      console.error(`Error deleting batch starting at index ${i}:`, error);
      results.push({
        success: false,
        batchSize: batch.length,
        error: error.message
      });
    }
  }
  
  // Check if all batches were successful
  const allSuccessful = results.every(result => result.success);
  
  return {
    success: allSuccessful,
    totalProcessed: events.length,
    batchResults: results
  };
}
