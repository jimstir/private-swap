const crypto = require('crypto');

// Helper function to validate addresses
function validateAddress(address, network = 'testnet') {
  try {
    const litecore = require('litecore-lib');
    const net = network === 'testnet' ? litecore.Networks.testnet : litecore.Networks.livenet;
    return litecore.Address.isValid(address, net);
  } catch (error) {
    return false;
  }
}

// Generate a random ID
function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

// Format amount in LTC
function formatAmount(amount) {
  return parseFloat(amount).toFixed(8);
}

// Sleep function for async/await
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Validate secret matches hash
function validateSecret(secret, hash) {
  const calculatedHash = crypto.createHash('sha256').update(secret).digest('hex');
  return calculatedHash === hash;
}

module.exports = {
  validateAddress,
  generateId,
  formatAmount,
  sleep,
  validateSecret
};
