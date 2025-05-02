const webhooks = `https://api.trello.com/1/webhooks/?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`
/**
 * Creates a webhook for Trello board events
 * @param {string} boardId - The ID of the Trello board to monitor
 * @param {string} callbackUrl - The URL that will receive the webhook events
 * @returns {Promise<Object>} - The created webhook object
 */
export const createTrelloWebhook = async (boardId, callbackUrl) => {
  const webhookUrl = `https://api.trello.com/1/webhooks/?callbackURL=${encodeURIComponent(callbackUrl)}&idModel=${boardId}&key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
  
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create Trello webhook: ${error}`);
  }

  return await response.json();
};

/**
 * Fetches a Trello board by ID
 * @param {string} boardId - The ID of the Trello board to retrieve
 * @returns {Promise<Object>} - The board object
 */
export const getTrelloBoard = async (boardId) => {
  const boardUrl = `https://api.trello.com/1/boards/${boardId}?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`;
  
  const response = await fetch(boardUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Trello board: ${error}`);
  }

  return await response.json();
};
/**
 * Processes multiple Trello boards and creates webhooks for each
 * @param {string[]} boardIds - Array of Trello board IDs to process
 * @param {string} callbackUrl - The URL that will receive the webhook events
 * @returns {Promise<Object[]>} - Array of created webhook objects
 */
export const processTrelloBoards = async (boardIds, callbackUrl) => {
  const webhooks = [];
  
  for (const boardId of boardIds) {
    try {
      const board = await getTrelloBoard(boardId);
      console.log(`Processing board: ${board.name}`);
      const webhook = await createTrelloWebhook(board.id, callbackUrl);
      webhooks.push(webhook);
    } catch (error) {
      console.error(`Error processing board ${boardId}:`, error);
    }
  }
  
  return webhooks;
};

// Example usage with hardcoded board IDs
const boardIds = ['5ZsXHDxJ', 'HwYIP2mX', 'J75fe3n1', 'VGXHcAQ0'];
processTrelloBoards(boardIds, process.env.TRELLO_CALLBACK_URL)
  .then(webhooks => console.log('Created webhooks:', webhooks))
  .catch(error => console.error('Failed to process boards:', error));