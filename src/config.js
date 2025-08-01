require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

module.exports = {
  // Litecoin Core RPC Configuration
  rpc: {
    username: process.env.LITECOIN_RPC_USER || '',
    password: process.env.LITECOIN_RPC_PASSWORD || '',
    host: process.env.LITECOIN_RPC_HOST || '127.0.0.1',
    port: parseInt(process.env.LITECOIN_RPC_PORT || '19332'),
    wallet: process.env.LITECOIN_WALLET || 'swap_wallet',
    protocol: process.env.LITECOIN_RPC_PROTOCOL || 'http'
  },
  
  // Network configuration
  network: process.env.NETWORK || 'testnet',
  
  // Swap configuration
  swap: {
    minAmount: parseFloat(process.env.MIN_SWAP_AMOUNT || '0.00001'),
    maxAmount: parseFloat(process.env.MAX_SWAP_AMOUNT || '1000'),
    defaultFeeRate: parseFloat(process.env.DEFAULT_FEE_RATE || '0.00002'),
    defaultExpiry: 24 // Default swap expiry in hours
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || path.join(logDir, 'swap.log'),
    console: process.env.LOG_CONSOLE !== 'false'
  },
  
  // Validate configuration
  validate: function() {
    if (!this.rpc.username || !this.rpc.password) {
      throw new Error('Litecoin Core RPC credentials are required');
    }
    
    if (this.network !== 'testnet' && this.network !== 'mainnet') {
      throw new Error('Network must be either testnet or mainnet');
    }
    
    if (this.swap.minAmount <= 0 || this.swap.maxAmount <= 0) {
      throw new Error('Swap amounts must be positive numbers');
    }
    
    if (this.swap.minAmount >= this.swap.maxAmount) {
      throw new Error('Minimum swap amount must be less than maximum swap amount');
    }
    
    return true;
  }
};
