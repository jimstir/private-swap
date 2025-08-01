require('dotenv').config();
const { ethers } = require('ethers');
const { JsonRpcProvider } = require('@ethersproject/providers');
const { WebSocketProvider } = require('@ethersproject/providers');
const LtcHtlc = require('../scripts/ltc-htlc');
const Web3 = require('web3');
const litecore = require('litecore-lib');
const { default: axios } = require('axios');

// Configuration
const config = {
  ethereum: {
    rpcUrl: process.env.ETH_RPC_URL || 'http://localhost:8545',
    wsUrl: process.env.ETH_WS_URL || 'ws://localhost:8545',
    privateKey: process.env.ETH_PRIVATE_KEY,
    swapManagerAddress: process.env.SWAP_MANAGER_ADDRESS,
    chainId: process.env.CHAIN_ID || 31337, // Default to Hardhat
    gasPrice: process.env.GAS_PRICE || '10', // in gwei
  },
  litecoin: {
    rpcUrl: process.env.LTC_RPC_URL || 'http://localhost:9332',
    rpcUser: process.env.LTC_RPC_USER || 'user',
    rpcPassword: process.env.LTC_RPC_PASSWORD || 'pass',
    network: process.env.LTC_NETWORK || 'testnet',
  },
  relayer: {
    checkInterval: parseInt(process.env.CHECK_INTERVAL || '30000'), // 30 seconds
    maxGasPrice: process.env.MAX_GAS_PRICE || '100', // in gwei
  },
};

// Initialize providers
const ethProvider = new JsonRpcProvider(config.ethereum.rpcUrl);
const ethWsProvider = new WebSocketProvider(config.ethereum.wsUrl);
const ethSigner = new ethers.Wallet(config.ethereum.privateKey, ethProvider);

// Initialize Litecoin RPC client
class LtcRpcClient {
  constructor(config) {
    this.config = config;
    this.auth = {
      username: config.rpcUser,
      password: config.rpcPassword,
    };
    this.rpcUrl = config.rpcUrl;
  }

  async call(method, params = []) {
    try {
      const response = await axios.post(
        this.rpcUrl,
        {
          jsonrpc: '1.0',
          id: 'relayer',
          method,
          params,
        },
        {
          auth: this.auth,
        }
      );
      return response.data.result;
    } catch (error) {
      console.error('LTC RPC Error:', error.response?.data || error.message);
      throw error;
    }
  }
}

const ltcRpc = new LtcRpcClient(config.litecoin);

// Load Swap Manager ABI
const swapManagerAbi = [
  'event CrossChainOrderCreated(bytes32 indexed orderId, address indexed initiator, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, bytes32 secretHash, uint256 ltcAmount, uint256 ltcTimeout)',
  'event CrossChainOrderFulfilled(bytes32 indexed orderId, address indexed resolver, bytes32 secret)',
  'event OrderRefunded(bytes32 indexed orderId)',
  'function fulfillCrossChainOrder(bytes32 orderId, bytes32 secret) external',
  'function refundOrder(bytes32 orderId) external',
  'function getOrder(bytes32 orderId) external view returns (address, address, uint256, uint256, address, address, uint256, bytes32, bool, bool)',
];

const swapManager = new ethers.Contract(
  config.ethereum.swapManagerAddress,
  swapManagerAbi,
  ethSigner
);

// Track active swaps
class SwapTracker {
  constructor() {
    this.activeSwaps = new Map();
  }

  async addSwap(orderId) {
    if (this.activeSwaps.has(orderId)) return;
    
    const order = await swapManager.getOrder(orderId);
    this.activeSwaps.set(orderId, {
      ...order,
      status: 'pending',
      lastChecked: Date.now(),
    });
    
    console.log(`Tracking new swap: ${orderId}`);
  }

  updateStatus(orderId, status) {
    const swap = this.activeSwaps.get(orderId);
    if (swap) {
      swap.status = status;
      swap.lastChecked = Date.now();
      console.log(`Swap ${orderId} status updated to: ${status}`);
    }
  }

  getPendingSwaps() {
    return Array.from(this.activeSwaps.entries())
      .filter(([_, swap]) => swap.status === 'pending');
  }
}

const swapTracker = new SwapTracker();

// Monitor Ethereum for new swaps
async function monitorEthereum() {
  console.log('Starting Ethereum event monitoring...');
  
  // Listen for new swap orders
  swapManager.on('CrossChainOrderCreated', async (orderId, initiator, tokenIn, tokenOut, amountIn, amountOutMin, secretHash, ltcAmount, ltcTimeout, event) => {
    console.log(`New cross-chain swap order detected: ${orderId}`);
    console.log(`Initiator: ${initiator}, Amount: ${amountIn} ${tokenIn} -> ${amountOutMin} ${tokenOut}`);
    console.log(`Litecoin amount: ${ltcAmount} LTC, Timeout: ${new Date(ltcTimeout * 1000).toISOString()}`);
    
    await swapTracker.addSwap(orderId);
    
    // Notify resolver about the new order (in a real implementation, this would be a webhook or message)
    console.log(`Notifying resolver about order ${orderId}...`);
  });
  
  // Listen for fulfilled orders
  swapManager.on('CrossChainOrderFulfilled', (orderId, resolver, secret) => {
    console.log(`Order ${orderId} fulfilled by ${resolver}`);
    console.log(`Secret revealed: ${secret}`);
    swapTracker.updateStatus(orderId, 'fulfilled');
  });
  
  // Listen for refunds
  swapManager.on('OrderRefunded', (orderId) => {
    console.log(`Order ${orderId} was refunded`);
    swapTracker.updateStatus(orderId, 'refunded');
  });
}

// Monitor Litecoin for HTLC transactions
async function monitorLitecoin() {
  console.log('Starting Litecoin monitoring...');
  
  // In a real implementation, this would use ZMQ or WebSockets to listen for blocks
  setInterval(async () => {
    try {
      const pendingSwaps = swapTracker.getPendingSwaps();
      
      for (const [orderId, swap] of pendingSwaps) {
        await checkLtcPayment(orderId, swap);
      }
    } catch (error) {
      console.error('Error checking Litecoin payments:', error);
    }
  }, config.relayer.checkInterval);
}

// Check if a payment was made to the HTLC address
async function checkLtcPayment(orderId, swap) {
  try {
    // In a real implementation, you would check the Litecoin blockchain
    // for transactions to the HTLC address and verify the amount
    console.log(`Checking Litecoin payment for order ${orderId}...`);
    
    // Simulate payment detection (replace with actual blockchain check)
    const paymentDetected = false; // Implement actual check
    
    if (paymentDetected) {
      console.log(`Payment detected for order ${orderId}, fulfilling on Ethereum...`);
      await fulfillEthereumOrder(orderId, 'SECRET_HERE'); // Replace with actual secret
    } else if (Date.now() / 1000 > swap.deadline) {
      console.log(`Deadline reached for order ${orderId}, initiating refund...`);
      await refundOrder(orderId);
    }
  } catch (error) {
    console.error(`Error checking payment for order ${orderId}:`, error);
  }
}

// Fulfill order on Ethereum
async function fulfillEthereumOrder(orderId, secret) {
  try {
    console.log(`Fulfilling order ${orderId}...`);
    
    const tx = await swapManager.fulfillCrossChainOrder(
      orderId,
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(secret))
    );
    
    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log(`Order ${orderId} fulfilled successfully`);
    
    swapTracker.updateStatus(orderId, 'fulfilled');
  } catch (error) {
    console.error(`Error fulfilling order ${orderId}:`, error);
    throw error;
  }
}

// Refund order on Ethereum
async function refundOrder(orderId) {
  try {
    console.log(`Refunding order ${orderId}...`);
    
    const tx = await swapManager.refundOrder(orderId);
    console.log(`Refund transaction sent: ${tx.hash}`);
    
    await tx.wait();
    console.log(`Order ${orderId} refunded successfully`);
    
    swapTracker.updateStatus(orderId, 'refunded');
  } catch (error) {
    console.error(`Error refunding order ${orderId}:`, error);
    throw error;
  }
}

// Start the relayer
async function start() {
  try {
    console.log('Starting PrivateSwap Relayer...');
    
    // Check connection to Ethereum
    const network = await ethProvider.getNetwork();
    console.log(`Connected to Ethereum network: ${network.name} (Chain ID: ${network.chainId})`);
    
    console.log(`Relayer address: ${ethSigner.address}`);
    
    // Check connection to Litecoin
    try {
      const info = await ltcRpc.call('getblockchaininfo');
      console.log(`Connected to Litecoin ${info.chain} (Blocks: ${info.blocks})`);
    } catch (error) {
      console.error('Failed to connect to Litecoin node. Make sure the node is running and RPC is enabled.');
      process.exit(1);
    }
    
    // Start monitoring
    await monitorEthereum();
    await monitorLitecoin();
    
    console.log('Relayer started successfully');
  } catch (error) {
    console.error('Failed to start relayer:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('Shutting down relayer...');
  process.exit(0);
});

// Start the relayer
start();
