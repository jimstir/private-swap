const crypto = require('crypto');
const { ethers } = require('ethers');

/**
 * Generate a random secret and its hash
 * @returns {Object} Object containing secret and its hash
 */
function generateSecretAndHash() {
  const secret = crypto.randomBytes(32).toString('hex');
  const hash = ethers.utils.sha256('0x' + secret);
  return { secret, hash };
}

/**
 * Generate a hash from a secret
 * @param {string} secret - The secret to hash
 * @returns {string} The hash of the secret
 */
function hashSecret(secret) {
  if (!secret) throw new Error('Secret is required');
  return ethers.utils.sha256(secret.startsWith('0x') ? secret : '0x' + secret);
}

/**
 * Verify a secret against a hash
 * @param {string} secret - The secret to verify
 * @param {string} hash - The expected hash
 * @returns {boolean} True if the secret hashes to the expected value
 */
function verifySecret(secret, hash) {
  if (!secret || !hash) return false;
  return hashSecret(secret) === hash.toLowerCase();
}

module.exports = {
  generateSecretAndHash,
  hashSecret,
  verifySecret
};
