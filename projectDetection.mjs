/**
 * Functions for improved project detection from event content
 */

/**
 * Project keywords mapping for content-based detection
 * Each project has an array of keywords that indicate it's related to that project
 */
const PROJECT_KEYWORDS = {
  'lymphapress': ['lymphapress', 'lympha', 'revo', 'compression', 'therapy', 'medical device'],
  'redline': ['redline', 'red line', 'rl-', 'redline-', 'automotive', 'car', 'vehicle'],
  'silo-down': ['silo', 'silo-down', 'silodown', 'marketing', 'campaign'],
  'pasley-hill': ['pasley', 'pasley-hill', 'pasleyhill', 'consulting']
};

/**
 * Determines the project name by analyzing event content
 * @param {Object} event - The webhook event object
 * @param {string} source - The source of the webhook ('github', 'trello', etc.)
 * @returns {string|null} - The detected project name or null if no match
 */
export function detectProjectFromContent(event, source) {
  // Convert event to string for keyword searching
  const eventString = JSON.stringify(event).toLowerCase();
  
  // Check GitHub specific content
  if (source === 'github') {
    // Extract repository name if available
    const repoName = event.body?.repository?.name || 
                    event.repository?.name || 
                    '';
    
    // Extract PR title, commit message, or issue title if available
    const title = event.body?.pull_request?.title || 
                 event.body?.commits?.[0]?.message ||
                 event.body?.issue?.title ||
                 event.pull_request?.title ||
                 event.commits?.[0]?.message ||
                 event.issue?.title ||
                 '';
                 
    // Combine repository name and title for better detection
    const contentToCheck = (repoName + ' ' + title).toLowerCase();
    
    console.log(`GitHub content to check: "${contentToCheck}"`);
    
    // Check for project keywords in the content
    for (const [project, keywords] of Object.entries(PROJECT_KEYWORDS)) {
      if (keywords.some(keyword => contentToCheck.includes(keyword))) {
        console.log(`Detected project ${project} from GitHub content`);
        return project;
      }
    }
  }
  
  // Check Trello specific content
  if (source === 'trello') {
    // Extract card name, board name, or list name if available
    const cardName = event.body?.action?.data?.card?.name || 
                    event.action?.data?.card?.name || 
                    '';
    
    const boardName = event.body?.action?.data?.board?.name || 
                     event.action?.data?.board?.name || 
                     '';
                     
    const listName = event.body?.action?.data?.list?.name || 
                    event.action?.data?.list?.name || 
                    '';
    
    // Combine all Trello elements for better detection
    const contentToCheck = (cardName + ' ' + boardName + ' ' + listName).toLowerCase();
    
    console.log(`Trello content to check: "${contentToCheck}"`);
    
    // Check for project keywords in the content
    for (const [project, keywords] of Object.entries(PROJECT_KEYWORDS)) {
      if (keywords.some(keyword => contentToCheck.includes(keyword))) {
        console.log(`Detected project ${project} from Trello content`);
        return project;
      }
    }
  }
  
  // Generic content check for all event types
  for (const [project, keywords] of Object.entries(PROJECT_KEYWORDS)) {
    if (keywords.some(keyword => eventString.includes(keyword))) {
      console.log(`Detected project ${project} from generic content`);
      return project;
    }
  }
  
  // No project detected from content
  return null;
}

/**
 * Gets the project name from a Slack webhook URL
 * @param {string} webhookUrl - The Slack webhook URL
 * @param {Object} slackChannels - Object mapping channel names to webhook URLs
 * @returns {string} - The project name
 */
export function getProjectNameFromWebhook(webhookUrl, slackChannels) {
  // Find the channel name that corresponds to this webhook URL
  const channelEntry = Object.entries(slackChannels).find(([_, url]) => url === webhookUrl);
  
  if (!channelEntry) {
    return 'unknown';
  }
  
  const channelName = channelEntry[0];
  
  // Map channel names to project names
  if (channelName.includes('redline')) return 'redline';
  if (channelName.includes('lymphapress')) return 'lymphapress';
  if (channelName.includes('silo-down')) return 'silo-down';
  if (channelName.includes('pasley-hill')) return 'pasley-hill';
  if (channelName.includes('bottest')) {
    // For test channel, try to infer from the channel name
    if (channelName.includes('redline')) return 'redline';
    if (channelName.includes('lympha')) return 'lymphapress';
    if (channelName.includes('silo')) return 'silo-down';
    if (channelName.includes('pasley')) return 'pasley-hill';
    return 'unknown';
  }
  
  // Default to the channel name if no specific mapping
  return channelName;
}

/**
 * Determines the correct project name by analyzing both event content and webhook URL
 * @param {Object} event - The webhook event object
 * @param {string} source - The source of the webhook ('github', 'trello', etc.)
 * @param {string} webhookUrl - The Slack webhook URL
 * @param {Object} slackChannels - Object mapping channel names to webhook URLs
 * @returns {string} - The determined project name
 */
export function determineProjectName(event, source, webhookUrl, slackChannels) {
  // First try to detect from content
  const contentProject = detectProjectFromContent(event, source);
  
  // If we found a project from content, use that
  if (contentProject) {
    console.log(`Using content-detected project: ${contentProject}`);
    return contentProject;
  }
  
  // Otherwise, fall back to webhook URL detection
  const webhookProject = getProjectNameFromWebhook(webhookUrl, slackChannels);
  console.log(`Using webhook-detected project: ${webhookProject}`);
  return webhookProject;
}
