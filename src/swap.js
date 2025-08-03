const LitecoinHTLC = require('./litecoin/htlc');
const LitecoinWallet = require('./litecoin/wallet');
const OrderService = require('./services/orderService');
const { generateSecretAndHash, verifySecret } = require('./utils/cryptoUtils');
const crypto = require('crypto');
const { ethers } = require('ethers');
const relayer = require('../relayer/inMemoryRelayer');

// Default configuration
const DEFAULT_CONFIG = {
  rpc: {
    protocol: 'http',
    host: '127.0.0.1',
    port: 19332, // Default testnet port
    username: '',
    password: '',
    wallet: 'swap_wallet' // Default wallet name
  },
  network: 'testnet',
  minAmount: 0.00001, // Minimum swap amount in LTC
  maxAmount: 1000,    // Maximum swap amount in LTC
  feeRate: 0.00002,   // Fee rate in LTC/kB
  defaultExpiry: 3600 // 1 hour default expiry
};

class AtomicSwap {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.network = this.config.network;
    
    // Initialize services
    this.litecoinHTLC = new LitecoinHTLC(this.network);
    this.litecoinWallet = new LitecoinWallet(this.network);
    this.orderService = new OrderService({
      defaultExpiry: this.config.defaultExpiry
    });
    
    // Initialize wallet connections
    if (config.ethereum) {
      this.ethereumWallet = config.ethereum;
    } else if (config.ethereumPrivateKey) {
      this.ethereumWallet = new ethers.Wallet(config.ethereumPrivateKey);
    }
    
    // Initialize storage
    this.swaps = new Map(); // Store active swaps
    this.orders = new Map(); // Store order details
    
    // Set up RPC URL
    this.rpcUrl = `${this.config.rpc.protocol}://${this.config.rpc.host}:${this.config.rpc.port}/wallet/${this.config.rpc.wallet}`;

    // Set up order status tracking
    this.setupOrderTracking();
  }

  // Set up order status tracking
  setupOrderTracking() {
    // Listen for order updates from the relayer
    relayer.onOrderUpdate((orderId, order) => {
      if (this.orders.has(orderId)) {
        const existingOrder = this.orders.get(orderId);
        this.orders.set(orderId, {
          ...existingOrder,
          ...order,
          updatedAt: new Date().toISOString()
        });
        
        // Emit event if needed
        if (this.emit) {
          this.emit('orderUpdate', this.orders.get(orderId));
        }
      }
    });
  }

  // Get order status
  async getOrderStatus(orderId) {
    if (this.orders.has(orderId)) {
      return this.orders.get(orderId);
    }
    return null;
  }

  // Make RPC call to Litecoin Core
  async rpcCall(method, params = []) {
    try {
      const response = await axios.post(this.rpcUrl, {
        jsonrpc: '1.0',
        id: 'swap',
        method,
        params
      }, {
        auth: {
          username: this.config.rpc.username,
          password: this.config.rpc.password
        }
      });
      return response.data.result;
    } catch (error) {
      console.error('RPC Error:', error.response?.data || error.message);
      throw new Error(`RPC call failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Validate swap amount
  validateAmount(amount) {
    const amountNum = parseFloat(amount);
    
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error('Amount must be a positive number');
    }
    
    if (amountNum < this.config.minAmount) {
      throw new Error(`Amount must be at least ${this.config.minAmount} LTC`);
    }
    
    if (amountNum > this.config.maxAmount) {
      throw new Error(`Amount cannot exceed ${this.config.maxAmount} LTC`);
    }
    
    // Convert to satoshis (1 LTC = 100,000,000 satoshis)
    return Math.round(amountNum * 100000000);
  }
  
  // Check if wallet has sufficient balance
  async checkBalance(amount) {
    const balance = await this.rpcCall('getbalance');
    const requiredBalance = amount + this.config.feeRate * 2; // Amount + fees
    
    if (balance < requiredBalance) {
      throw new Error(`Insufficient balance. Need ${requiredBalance} LTC, have ${balance} LTC`);
    }
    
    return true;
  }

  /**
   * Initiate a new ETH to LTC swap
   * @param {Object} params - Swap parameters
   * @param {string|number} params.ethAmount - Amount of ETH to swap
   * @param {string|number} params.ltcAmount - Expected amount of LTC to receive (in LTC)
   * @param {string} params.ltcRecipient - LTC recipient address
   * @param {string} [params.ltcRefundAddress] - Optional LTC refund address
   * @param {number} [params.expiry] - Optional expiry time in seconds from now
   * @returns {Promise<Object>} Swap details including order and HTLC information
   */
  async initiateEthToLtcSwap(params) {
    const {
      ethAmount,
      ltcAmount,
      ltcRecipient,
      ltcRefundAddress,
      expiry = this.config.defaultExpiry
    } = params;

    // Validate parameters
    if (!this.ethereumWallet) {
      throw new Error('Ethereum wallet not configured');
    }
    if (!ethAmount || !ltcAmount || !ltcRecipient) {
      throw new Error('Missing required parameters');
    }

    // Generate secret and hash
    const { secret, hash } = this.litecoinHTLC.generateSecret();
    
    // Create local order
    const order = {
      type: 'eth_to_ltc',
      makerAddress: this.ethereumWallet.address,
      ethAmount: ethAmount.toString(),
      ltcAmount: ltcAmount.toString(),
      secretHash: hash,
      ltcRefundAddress: ltcRefundAddress || this.litecoinWallet.address,
      targetLtcAddress: ltcRecipient,
      expiry: Math.floor(Date.now() / 1000) + expiry,
      status: 'pending'
    };

    // Submit order to relayer
    const result = await relayer.submitOrder(order);
    
    // Store order locally
    this.orders.set(result.orderId, {
      ...order,
      id: result.orderId,
      secret,
      hash,
      status: 'pending'
    });

    // Create HTLC script and address
    const htlcExpiry = Math.floor(Date.now() / 1000) + expiry;
    const script = this.litecoinHTLC.createHTLCScript(
      ltcRecipient,
      ltcRefundAddress || this.litecoinWallet.address,
      hash,
      htlcExpiry
    );
    
    const htlcAddress = this.litecoinHTLC.getHTLCAddress(script);
    
    // Store swap details
    const swapId = crypto.randomBytes(16).toString('hex');
    this.swaps.set(swapId, {
      type: 'initiator',
      direction: 'eth-to-ltc',
      status: 'pending',
      order,
      amount: ethAmount,
      htlcAddress,
      script,
      hash,
      secret,
      expiry: htlcExpiry,
      recipient: ltcRecipient,
      createdAt: Date.now()
    });

    // Store order reference
    this.orders.set(order.orderHash || order.metadata.secretHash, {
      swapId,
      type: 'eth-to-ltc',
      status: 'pending',
      order,
      createdAt: Date.now()
    });
    
    return { 
      swapId, 
      order,
      htlcAddress, 
      hash,
      secret // Note: In production, the secret should be stored securely
    };
  }

  /**
   * Initiate a new LTC to ETH swap
   * @param {Object} params - Swap parameters
   * @param {string|number} params.ltcAmount - Amount of LTC to swap (in LTC)
   * @param {string|number} params.ethAmount - Expected amount of ETH to receive
   * @param {string} params.ethRecipient - ETH recipient address
   * @param {string} [params.ltcRefundAddress] - Optional LTC refund address
   * @param {number} [params.expiry] - Optional expiry time in seconds from now
   * @returns {Promise<Object>} Swap details including order and HTLC information
   */
  async initiateLtcToEthSwap(params) {
    const {
      ltcAmount,
      ethAmount,
      ethRecipient,
      ltcRefundAddress,
      expiry = this.config.defaultExpiry
    } = params;

    // Validate parameters
    if (!this.ethereumWallet) {
      throw new Error('Ethereum wallet not configured');
    }
    if (!ltcAmount || !ethAmount || !ethRecipient) {
      throw new Error('Missing required parameters');
    }

    // Generate secret and hash
    const { secret, hash } = generateSecretAndHash();
    
    // Create order
    const order = {
      type: 'ltc_to_eth',
      makerAddress: this.litecoinWallet.address,
      ltcAmount: ltcAmount.toString(),
      ethAmount: ethAmount.toString(),
      secretHash: hash,
      ltcRefundAddress: ltcRefundAddress || this.litecoinWallet.address,
      targetEthAddress: ethRecipient,
      expiry: Math.floor(Date.now() / 1000) + expiry,
      status: 'pending'
    };

    // Submit order to relayer
    const result = await relayer.submitOrder(order);
    
    // Store order locally
    this.orders.set(result.orderId, {
      ...order,
      id: result.orderId,
      secret,
      hash,
      status: 'pending'
    });

    // Create HTLC script and address
    const htlcExpiry = Math.floor(Date.now() / 1000) + expiry;
    const script = this.litecoinHTLC.createHTLCScript(
      this.litecoinWallet.address, // Will be updated by the relayer
      ltcRefundAddress || this.litecoinWallet.address,
      hash,
      htlcExpiry
    );
    
    const htlcAddress = this.litecoinHTLC.getHTLCAddress(script);
    
    // Store swap details
    const swapId = crypto.randomBytes(16).toString('hex');
    this.swaps.set(swapId, {
      type: 'initiator',
      direction: 'ltc-to-eth',
      status: 'pending',
      order,
      amount: ltcAmount,
      htlcAddress,
      script,
      hash,
      secret,
      expiry: htlcExpiry,
      recipient: ethRecipient,
      createdAt: Date.now()
    });

    // Store order reference
    this.orders.set(order.orderHash || order.metadata.secretHash, {
      swapId,
      type: 'ltc-to-eth',
      status: 'pending',
      order,
      createdAt: Date.now()
    });
    
    return { 
      swapId, 
      order,
      htlcAddress, 
      hash,
      secret // Note: In production, the secret should be stored securely
    };
  }

  /**
   * Participate in a swap (Participant side)
   * @param {Object} initiatorDetails - Details from the initiator
   * @param {string|number} amount - Amount to participate with
   * @param {string} recipientAddress - Address to receive funds
   * @returns {Promise<Object>} Participation details
   */
  async participate(initiatorDetails, amount, recipientAddress) {
    const { hash, expiry, htlcAddress } = initiatorDetails;
    
    // Verify the HTLC script
    const script = this.litecoinHTLC.createHTLCScript(
      recipientAddress,
      this.litecoinWallet.generateWallet().address, // Refund address
      hash,
      expiry
    );
    
    const derivedHtlcAddress = this.litecoinHTLC.getHTLCAddress(script);
    
    if (derivedHtlcAddress !== htlcAddress) {
      throw new Error('Invalid HTLC address');
    }
    
    // Store participant's swap details
    const swapId = crypto.randomBytes(16).toString('hex');
    this.swaps.set(swapId, {
      id: swapId,
      status: 'participating',
      hash: hash,
      htlcAddress: htlcAddress,
      amount: amount,
      recipient: recipientAddress,
      initiator: false
    });
    
    return {
      swapId: swapId,
      htlcAddress: htlcAddress,
      amount: amount
    };
  }

  // Redeem the swap (Participant redeems with secret)
  async redeem(swapId, secret) {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');
    
    // Verify the secret matches the hash
    const hash = crypto.createHash('sha256').update(secret).digest('hex');
    if (hash !== swap.hash) {
      throw new Error('Invalid secret');
    }
    
    // In a real implementation, you would create and broadcast a transaction here
    // that spends from the HTLC using the secret
    swap.status = 'completed';
    swap.secret = secret;
    
    return {
      status: 'completed',
      swapId: swapId,
      secret: secret
    };
  }

  // Refund the swap (Initiator refunds after expiry)
  async refund(swapId) {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');
    
    // Check if the swap has expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < swap.expiry) {
      throw new Error('Swap has not expired yet');
    }
    
    // In a real implementation, you would create and broadcast a transaction here
    // that spends from the HTLC after the locktime has passed
    swap.status = 'refunded';
    
    return {
      status: 'refunded',
      swapId: swapId
    };
  }

  // Get swap status
  getSwapStatus(swapId) {
    const swap = this.swaps.get(swapId);
    if (!swap) throw new Error('Swap not found');
    
    return {
      id: swapId,
      status: swap.status,
      amount: swap.amount,
      htlcAddress: swap.htlcAddress,
      expiry: swap.expiry,
      recipient: swap.recipient,
      hash: swap.hash,
      secret: swap.secret
    };
  }
}

module.exports = AtomicSwap;
