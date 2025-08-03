// Contract addresses (replace with actual deployed addresses)
const CONTRACTS = {
  // Mainnet
  1: {
    swapManager: '0x...',
    oneInchFusion: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  // Sepolia
  11155111: {
    swapManager: process.env.SWAP_MANAGER_ADDRESS || '0x...',
    oneInchFusion: '0x1111111254EEB25477B68fb85Ed929f73A960582', // Same as mainnet for now
    weth: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', // WETH on Sepolia
  },
};

// Default configuration
const DEFAULT_CONFIG = {
  // Default gas settings
  gasLimit: 500000,
  gasPrice: ethers.utils.parseUnits('10', 'gwei'),
  
  // Default token addresses
  tokens: {
    eth: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    // Add other token addresses as needed
  },
  
  // Default order settings
  order: {
    expiry: 3600, // 1 hour in seconds
    feeRecipient: '0x0000000000000000000000000000000000000000', // No fee by default
  },
};

// Get configuration for a specific chain ID
function getConfig(chainId) {
  const chainConfig = CONTRACTS[chainId] || {};
  return {
    ...DEFAULT_CONFIG,
    ...chainConfig,
    chainId: Number(chainId),
  };
}

module.exports = {
  CONTRACTS,
  DEFAULT_CONFIG,
  getConfig,
};
