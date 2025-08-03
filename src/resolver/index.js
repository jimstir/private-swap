const crypto = require('crypto');
const relayer = require('../../relayer/inMemoryRelayer');
const { ethers } = require('ethers');
const { 
  convertTo1InchOrder, 
  convertToSwapManagerFormat 
} = require('../utils/orderUtils');
const { getConfig } = require('../../config/resolver.config');

// Error classes for better error handling
class ResolverError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ResolverError';
    this.code = code;
    this.details = details;
  }
}

class OrderValidationError extends ResolverError {
  constructor(message, details = {}) {
    super(message, 'ORDER_VALIDATION_ERROR', details);
    this.name = 'OrderValidationError';
  }
}

class BlockchainError extends ResolverError {
  constructor(message, details = {}) {
    super(message, 'BLOCKCHAIN_ERROR', details);
    this.name = 'BlockchainError';
  }
}

class Resolver {
  constructor(config = {}) {
    this.config = {
      minProfit: config.minProfit || 0.001, // Minimum profit in ETH to accept an order
      maxSlippage: config.maxSlippage || 0.01, // 1% max slippage
      ...config
    };
    this.ethWallet = config.ethWallet; // Should be an ethers wallet instance
    this.ltcWallet = config.ltcWallet; // Should be a litecoin wallet instance
    this.registered = false;
  }

  async start() {
    if (!this.registered) {
      this.resolverId = relayer.registerResolver(this);
      this.registered = true;
      console.log(`Resolver started with ID: ${this.resolverId}`);
    }
  }

  async handleNewOrder(order) {
    try {
      console.log(`Processing new order: ${order.id}`);
      
      // Skip if not our type of order
      if (order.status !== 'pending') return;

      // Simulate some business logic to decide if we want to take this order
      const shouldAccept = await this.shouldAcceptOrder(order);
      
      if (shouldAccept) {
        await this.acceptOrder(order);
      }
    } catch (error) {
      console.error(`Error processing order ${order.id}:`, error);
    }
  }

  async shouldAcceptOrder(order) {
    // Simulate checking if order is profitable
    // In a real implementation, this would check market rates, fees, etc.
    const isProfitable = Math.random() > 0.5; // 50% chance to accept for testing
    
    if (!isProfitable) {
      console.log(`Skipping order ${order.id} - not profitable`);
      return false;
    }

    // Check if we have enough balance
    if (order.type === 'eth_to_ltc') {
      const balance = await this.ltcWallet.getBalance();
      if (balance < parseFloat(order.ltcAmount)) {
        console.log(`Skipping order ${order.id} - insufficient LTC balance`);
        return false;
      }
    } else {
      const balance = await this.ethWallet.getBalance();
      if (balance < parseFloat(order.ethAmount)) {
        console.log(`Skipping order ${order.id} - insufficient ETH balance`);
        return false;
      }
    }

    return true;
  }

  async acceptOrder(order) {
    let txHash;
    try {
      console.log(`[${new Date().toISOString()}] Accepting order: ${order.id}`);
      
      // 1. Validate the order
      this.validateOrder(order);
      
      // 2. Get chain configuration
      const chainId = await this.ethWallet.getChainId();
      const config = getConfig(chainId);
      
      if (!config.swapManager) {
        throw new Error(`No SwapManager address configured for chain ${chainId}`);
      }
      
      // 3. Convert the simple order to 1inch format
      console.log(`[${order.id}] Converting order to 1inch format...`);
      const inchOrder = await convertTo1InchOrder(order, this.ethWallet, config);
      
      // 4. Convert to SwapManager format
      console.log(`[${order.id}] Converting to SwapManager format...`);
      const swapManagerOrder = convertToSwapManagerFormat(inchOrder);
      
      // 5. Get the contract instance
      console.log(`[${order.id}] Initializing SwapManager contract...`);
      const swapManager = new ethers.Contract(
        config.swapManager,
        [
          'function fulfillOrder(bytes32,bytes32,(bytes32,uint256,uint256,uint256,address,address,uint256,uint8,bytes32,bytes32))',
          'function getOrderStatus(bytes32) view returns (uint8)'
        ],
        this.ethWallet
      );
      
      // 6. Check if order is already fulfilled
      const orderStatus = await swapManager.getOrderStatus(order.id);
      if (orderStatus === 2) { // 2 = Fulfilled
        throw new OrderValidationError('Order already fulfilled');
      }
      
      // 7. Generate a random secret
      console.log(`[${order.id}] Generating secret...`);
      const secret = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const secretHash = ethers.utils.keccak256(secret);
      
      // 8. Prepare transaction
      console.log(`[${order.id}] Preparing transaction...`);
      const txRequest = {
        to: config.swapManager,
        data: swapManager.interface.encodeFunctionData('fulfillOrder', [
          order.id,
          secretHash,
          [
            swapManagerOrder.orderHash,
            swapManagerOrder.makerAmount,
            swapManagerOrder.takerAmount,
            swapManagerOrder.threshold,
            swapManagerOrder.maker,
            swapManagerOrder.taker,
            swapManagerOrder.salt,
            swapManagerOrder.expiry,
            swapManagerOrder.v,
            swapManagerOrder.r,
            swapManagerOrder.s
          ]
        ]),
        gasLimit: config.gasLimit,
        gasPrice: config.gasPrice,
      };
      
      // 9. Estimate gas and send transaction
      console.log(`[${order.id}] Estimating gas...`);
      const estimatedGas = await this.ethWallet.estimateGas(txRequest).catch(err => {
        console.error(`[${order.id}] Gas estimation failed:`, err);
        throw new BlockchainError('Gas estimation failed', { originalError: err.message });
      });
      
      console.log(`[${order.id}] Sending transaction...`);
      const tx = await this.ethWallet.sendTransaction({
        ...txRequest,
        gasLimit: estimatedGas.mul(12).div(10), // Add 20% buffer
      });
      
      txHash = tx.hash;
      console.log(`[${order.id}] Transaction sent:`, txHash);
      
      // 10. Wait for the transaction to be mined
      console.log(`[${order.id}] Waiting for confirmation...`);
      const receipt = await tx.wait();
      
      console.log(`[${order.id}] Order fulfilled in block ${receipt.blockNumber}`);
      
      // 11. Update order status
      relayer.updateOrderStatus(order.id, 'completed', {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        secret: secret,
        timestamp: new Date().toISOString()
      });
      
      return {
        orderId: order.id,
        status: 'completed',
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber
      };
      
    } catch (error) {
      console.error(`[${order.id}] Error:`, error);
      
      const errorDetails = {
        error: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        txHash,
        timestamp: new Date().toISOString()
      };
      
      if (error.details) {
        errorDetails.details = error.details;
      }
      
      relayer.updateOrderStatus(order.id, 'failed', errorDetails);
      
      // Re-throw the error for the caller to handle
      throw error;
    }
  }
  
  /**
   * Validate an order before processing
   * @param {Object} order - The order to validate
   * @throws {OrderValidationError} If the order is invalid
   */
  validateOrder(order) {
    if (!order || typeof order !== 'object') {
      throw new OrderValidationError('Invalid order format');
    }
    
    const requiredFields = ['id', 'type', 'makerAddress', 'ethAmount', 'ltcAmount', 'expiry'];
    const missingFields = requiredFields.filter(field => !(field in order));
    
    if (missingFields.length > 0) {
      throw new OrderValidationError(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    // Check if order is expired
    const now = Math.floor(Date.now() / 1000);
    if (order.expiry <= now) {
      throw new OrderValidationError('Order has expired', { 
        expiry: order.expiry,
        currentTime: now 
      });
    }
    
    // Validate amounts
    if (Number(order.ethAmount) <= 0 || Number(order.ltcAmount) <= 0) {
      throw new OrderValidationError('Invalid amount', {
        ethAmount: order.ethAmount,
        ltcAmount: order.ltcAmount
      });
    }
  }

  async fulfillOrder(order) {
    try {
      console.log(`Fulfilling order: ${order.id}`);
      
      // Simulate successful fulfillment
      relayer.updateOrderStatus(order.id, 'fulfilled', {
        fulfilledAt: new Date().toISOString(),
        txHash: `0x${crypto.randomBytes(32).toString('hex')}`
      });
      
    } catch (error) {
      console.error(`Error fulfilling order ${order.id}:`, error);
      relayer.updateOrderStatus(order.id, 'failed', {
        error: error.message
      });
    }
  }
}

module.exports = Resolver;
