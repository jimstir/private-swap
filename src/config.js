require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

module.exports = {
  // RPC Configuration (legacy, will be removed in future versions)
  rpc: {
    username: process.env.LITECOIN_RPC_USER || 'user',
    password: process.env.LITECOIN_RPC_PASSWORD || 'pass',
    host: process.env.LITECOIN_RPC_HOST || '127.0.0.1',
    port: parseInt(process.env.LITECOIN_RPC_PORT || '19332'),
    wallet: process.env.LITECOIN_WALLET || 'swap_wallet',
    protocol: process.env.LITECOIN_RPC_PROTOCOL || 'http'
  },
  network: 'testnet', // Legacy, use networks.litecoin.network instead
  
  // Network configuration
  networks: {
    litecoin: {
      network: process.env.LITECOIN_NETWORK || 'testnet',
      rpc: {
        username: process.env.LITECOIN_RPC_USER || 'user',
        password: process.env.LITECOIN_RPC_PASSWORD || 'pass',
        host: process.env.LITECOIN_RPC_HOST || '127.0.0.1',
        port: parseInt(process.env.LITECOIN_RPC_PORT || '19332'),
        wallet: process.env.LITECOIN_WALLET || 'swap_wallet',
        protocol: process.env.LITECOIN_RPC_PROTOCOL || 'http'
      }
    },
    ethereum: {
      network: process.env.ETHEREUM_NETWORK || 'sepolia',
      rpc: {
        url: process.env.ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/YOUR-PROJECT-ID',
        chainId: parseInt(process.env.ETHEREUM_CHAIN_ID || '11155111') // Sepolia chain ID
      },
      contracts: {
        // Will be populated during deployment
      }
    }
  },
  
  // Swap configuration (user input)
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
    // Validate Litecoin RPC connection
    if (!this.networks.litecoin.rpc.username || !this.networks.litecoin.rpc.password) {
      throw new Error('Litecoin Core RPC credentials are required');
    }
    
    // Validate network types
    if (this.networks.litecoin.network !== 'testnet' && this.networks.litecoin.network !== 'mainnet') {
      throw new Error('Litecoin network must be either testnet or mainnet');
    }
    
    if (this.networks.ethereum.network !== 'sepolia' && this.networks.ethereum.network !== 'mainnet') {
      throw new Error('Ethereum network must be either sepolia or mainnet');
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
