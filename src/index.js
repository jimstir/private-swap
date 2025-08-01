#!/usr/bin/env node

const { Command } = require('commander');
const AtomicSwap = require('./swap');
const config = require('./config');
const logger = require('./logger');

// Initialize the program
const program = new Command();
program
  .name('lswap')
  .description('CLI for Litecoin Atomic Swaps')
  .version('1.0.0');

// Initialize the AtomicSwap instance
let swap;

try {
  // Validate configuration
  config.validate();
  
  // Initialize AtomicSwap with config
  swap = new AtomicSwap({
    rpc: config.rpc,
    network: config.network,
    minAmount: config.swap.minAmount,
    maxAmount: config.swap.maxAmount,
    feeRate: config.swap.defaultFeeRate
  });
  
  logger.info(`Atomic Swap CLI initialized on ${config.network} network`);
} catch (error) {
  logger.error('Failed to initialize:', error.message);
  process.exit(1);
}

// Create command
program.command('create <amount> <recipient>')
  .description('Create a new atomic swap')
  .option('-e, --expiry <hours>', 'Expiry time in hours', '24')
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

// Parse command line arguments
program.parseAsync(process.argv).catch(error => {
  logger.error('Command failed:', error);
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
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});
