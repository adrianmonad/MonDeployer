/**
 * Utility to load private key from env.js
 * This makes it easier for AI assistants to find and use the private key
 * without needing to directly reference env.js in every script
 */

// Import the private key from env.js
const { PRIVATE_KEY } = require('./env.js');

// Function to get the private key
function getPrivateKey() {
  if (!PRIVATE_KEY) {
    throw new Error('Private key not found in env.js');
  }
  return PRIVATE_KEY;
}

// Export both the raw key and the function
module.exports = {
  PRIVATE_KEY,
  getPrivateKey
}; 