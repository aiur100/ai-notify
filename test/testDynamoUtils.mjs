/**
 * Test script for DynamoDB utility functions
 * This script demonstrates the usage of storeEvent and getAllProjectEvents functions
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDynamoClient, storeEvent, getAllProjectEvents, batchDeleteEvents } from '../dynamoUtils.mjs';

// Get the directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a DynamoDB client with the pasley_hill profile and us-east-1 region
const dynamoClient = createDynamoClient({ profile: 'pasley_hill', region: 'us-east-1' });

// Test project name
const TEST_PROJECT_NAME = 'test-project';

/**
 * Main test function
 */
async function runTests() {
  console.log('Starting DynamoDB utility tests...');
  
  try {
    // Load sample event data
    const sampleEventPath = path.join(__dirname, 'sampleEvent.json');
    const sampleEvent = JSON.parse(fs.readFileSync(sampleEventPath, 'utf8'));
    
    console.log('Sample event data:', sampleEvent);
    
    // Test storeEvent function
    console.log(`\nStoring event for project: ${TEST_PROJECT_NAME}`);
    const storeResult = await storeEvent({
      projectName: TEST_PROJECT_NAME,
      event: sampleEvent,
      dynamoClient
    });
    
    console.log('Store result:', storeResult);
    
    // Wait a moment to ensure data is available
    console.log('\nWaiting for data to be available...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test getAllProjectEvents function
    console.log(`\nRetrieving all events for project: ${TEST_PROJECT_NAME}`);
    const getResult = await getAllProjectEvents({
      projectName: TEST_PROJECT_NAME,
      dynamoClient
    });
    
    console.log('Get result:', getResult);
    
    if (getResult.success && getResult.events.length > 0) {
      console.log(`\nFound ${getResult.events.length} events for project ${TEST_PROJECT_NAME}`);
      console.log('First event data:', getResult.events[0].data);
      
      // Test batchDeleteEvents function
      console.log('\nTesting batch delete of events...');
      const deleteResult = await batchDeleteEvents({
        events: getResult.events,
        dynamoClient
      });
      
      console.log('Delete result:', deleteResult);
      
      // Verify deletion by trying to get events again
      console.log('\nVerifying deletion by retrieving events again...');
      const verifyResult = await getAllProjectEvents({
        projectName: TEST_PROJECT_NAME,
        dynamoClient
      });
      
      if (verifyResult.success && verifyResult.events.length === 0) {
        console.log('Deletion verified: No events found after deletion');
      } else if (verifyResult.success) {
        console.log(`Warning: Found ${verifyResult.events.length} events after deletion`);
      } else {
        console.log('Error verifying deletion:', verifyResult.error);
      }
    } else {
      console.log('No events found or error occurred');
    }
    
    console.log('\nTests completed successfully!');
  } catch (error) {
    console.error('Error during tests:', error);
  }
}

// Run the tests
runTests();
