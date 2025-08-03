#!/usr/bin/env node

const { Command } = require('commander');
const { ethers } = require('ethers');
const AtomicSwap = require('./swap');
const config = require('./config');
const logger = require('./logger');

// Initialize the program
const program = new Command();
program
  .name('private-swap')
  .description('Cross-chain atomic swap between Litecoin and Ethereum')
  .version('1.0.0');

// Initialize the AtomicSwap instance
let swap;

// Initialize Ethereum provider with MetaMask
async function initEthereum() {
  try {
    // Check if MetaMask is installed
    if (typeof window.ethereum === 'undefined') {
      throw new Error('MetaMask is not installed');
    }

    // Request account access if needed
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    
    // Get the signer (connected account)
    const signer = provider.getSigner();
    const address = await signer.getAddress();
    
    // Get network details
    const network = await provider.getNetwork();
    
    // Check if we're on Sepolia
    if (network.chainId !== 11155111) { // Sepolia chain ID
      try {
        // Try to switch to Sepolia
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }], // Sepolia chain ID in hex
        });
      } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xaa36a7',
                chainName: 'Sepolia Test Network',
                nativeCurrency: {
                  name: 'Sepolia ETH',
                  symbol: 'ETH',
                  decimals: 18
                },
                rpcUrls: ['https://sepolia.infura.io/v3/'],
                blockExplorerUrls: ['https://sepolia.etherscan.io']
              }],
            });
          } catch (addError) {
            throw new Error('Failed to add Sepolia network to MetaMask');
          }
        } else {
          throw new Error('Failed to switch to Sepolia network');
        }
      }
    }
    
    logger.info(`Connected to Ethereum ${network.name} network`);
    logger.info(`Connected account: ${address}`);
    
    return {
      provider,
      signer,
      network: network.name,
      chainId: network.chainId,
      address
    };
  } catch (error) {
    logger.error('Failed to initialize Ethereum with MetaMask:', error);
    process.exit(1);
  }
}

// Initialize Litecoin connection
function initLitecoin() {
  try {
    const ltcConfig = config.networks.litecoin;
    
    logger.info(`Connected to Litecoin ${ltcConfig.network} network`);
    logger.info(`RPC URL: ${ltcConfig.rpc.protocol}://${ltcConfig.rpc.host}:${ltcConfig.rpc.port}`);
    
    return {
      network: ltcConfig.network,
      rpc: ltcConfig.rpc
    };
  } catch (error) {
    logger.error('Failed to initialize Litecoin:', error);
    process.exit(1);
  }
}

// Main initialization
async function initialize() {
  try {
    // Validate configuration
    config.validate();
    
    // Initialize connections
    const eth = await initEthereum();
    const ltc = initLitecoin();
    
    // Initialize AtomicSwap with config
    swap = new AtomicSwap({
      ethereum: {
        provider: eth.provider,
        signer: eth.signer,
        network: eth.network,
        chainId: eth.chainId,
        address: eth.address
      },
      litecoin: ltc,
      minAmount: config.swap.minAmount,
      maxAmount: config.swap.maxAmount,
      defaultExpiry: config.swap.defaultExpiry
    });
    
    logger.info(`Atomic Swap initialized with MetaMask`);
    logger.info(`Ethereum address: ${eth.address}`);
    logger.info(`Litecoin network: ${ltc.network}`);
    
    return swap;
  } catch (error) {
    logger.error('Initialization failed:', error);
    process.exit(1);
  }
}

// Initialize the application
initialize().then(() => {
  logger.info('Application initialized successfully');
  
  // Create command
  program.command('create <amount> <recipient>')
    .description('Create a new atomic swap')
    .option('-e, --expiry <hours>', 'Expiry time in hours', '24')
    .option('-t, --type <type>', 'Swap type: eth-to-ltc or ltc-to-eth', 'eth-to-ltc')
    .action(async (amount, recipient, options) => {
    try {
      logger.info(`Initiating swap of ${amount} LTC to ${recipient}`);
      
      const result = await swap.initiateSwap(
        parseFloat(amount),
        recipient,
        parseInt(options.expiry)
      );
      
      console.log('\n=== Swap Created Successfully ===');
      console.log('Swap ID:', result.swapId);
      console.log('HTLC Address:', result.htlcAddress);
      console.log('Amount:', result.amount, 'LTC');
      console.log('Expiry:', new Date(result.expiry * 1000).toISOString());
      console.log('Funding TX ID:', result.fundingTxId);
      console.log('\nShare this hash with the participant:');
      console.log('Hash:', result.hash);
      
      logger.info(`Swap ${result.swapId} created successfully`);
    } catch (error) {
      logger.error('Failed to create swap:', error.message);
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Participate command
program.command('participate <hash> <amount> <recipient>')
  .description('Participate in an existing atomic swap')
  .action(async (hash, amount, recipient) => {
    try {
      logger.info(`Participating in swap with hash: ${hash}`);
      
      const result = await swap.participate(
        { hash },
        parseFloat(amount),
        recipient
      );
      
      console.log('\n=== Swap Participation Successful ===');
      console.log('Swap ID:', result.swapId);
      console.log('HTLC Address:', result.htlcAddress);
      console.log('Amount:', result.amount, 'LTC');
      
      logger.info(`Participated in swap ${result.swapId}`);
    } catch (error) {
      logger.error('Failed to participate in swap:', error.message);
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Redeem command
program.command('redeem <swapId> <secret>')
  .description('Redeem an atomic swap using the secret')
  .action(async (swapId, secret) => {
    try {
      logger.info(`Redeeming swap ${swapId}`);
      
      const result = await swap.redeem(swapId, secret);
      
      console.log('\n=== Swap Redeemed Successfully ===');
      console.log('Status:', result.status);
      console.log('Swap ID:', result.swapId);
      
      if (result.txId) {
        console.log('Transaction ID:', result.txId);
      }
      
      logger.info(`Swap ${result.swapId} redeemed successfully`);
    } catch (error) {
      logger.error('Failed to redeem swap:', error.message);
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Status command
program.command('status <swapId>')
  .description('Check the status of an atomic swap')
  .action(async (swapId) => {
    try {
      const status = swap.getSwapStatus(swapId);
      
      console.log('\n=== Swap Status ===');
      console.log('Swap ID:', status.id);
      console.log('Status:', status.status);
      console.log('Amount:', status.amountLTC, 'LTC');
      console.log('HTLC Address:', status.htlcAddress);
      console.log('Recipient:', status.recipient);
      console.log('Expiry:', new Date(status.expiry * 1000).toISOString());
      
      if (status.fundingTxId) {
        console.log('Funding TX ID:', status.fundingTxId);
      }
      
      if (status.secret) {
        console.log('Secret:', status.secret);
      }
      
      logger.info(`Checked status of swap ${swapId}: ${status.status}`);
    } catch (error) {
      logger.error('Failed to get swap status:', error.message);
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

  // Start the CLI
  program.parseAsync(process.argv).catch(error => {
    logger.error('Command failed:', error);
    console.error('Error:', error.message);
    process.exit(1);
  });
}).catch(error => {
  logger.error('Failed to initialize application:', error);
  console.error('Error:', error.message);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  console.error('Fatal error:', error.message);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
