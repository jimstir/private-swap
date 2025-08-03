const crypto = require('crypto');

// Helper function to validate addresses
const bitcoin = require('bitcoinjs-lib');
const bech32 = require('bech32');

function validateAddress(address, network = 'testnet') {
  try {
    // Litecoin testnet network params
    const ltcTestnet = {
      messagePrefix: '\x19Litecoin Signed Message:\n',
      bech32: 'tltc',
      bip32: { public: 0x043587cf, private: 0x04358394 },
      pubKeyHash: 0x6f,
      scriptHash: 0x3a,
      wif: 0xef,
    };
    // Check bech32 (native segwit)
    if (address.startsWith('tltc1')) {
      try {
        const decoded = bech32.decode(address);
        return decoded.prefix === 'tltc';
      } catch (e) {
        return false;
      }
    }
    // Check base58 (P2PKH/P2SH)
    const payload = bitcoin.address.fromBase58Check(address);
    if (network === 'testnet') {
      return (
        payload.version === ltcTestnet.pubKeyHash ||
        payload.version === ltcTestnet.scriptHash
      );
    }
    // For mainnet (not used here):
    // ... add mainnet params if needed
    return false;
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
