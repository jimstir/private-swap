const LitecoinHTLC = require('./litecoin/htlc');
const LitecoinWallet = require('./litecoin/wallet');
const crypto = require('crypto');
const axios = require('axios');

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
  feeRate: 0.00002    // Fee rate in LTC/kB
};

class AtomicSwap {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.network = this.config.network;
    this.litecoinHTLC = new LitecoinHTLC(this.network);
    this.litecoinWallet = new LitecoinWallet(this.network);
    this.swaps = new Map(); // Store active swaps
    this.rpcUrl = `${this.config.rpc.protocol}://${this.config.rpc.host}:${this.config.rpc.port}/wallet/${this.config.rpc.wallet}`;
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

  // Initialize a new swap (Initiator side)
  async initiateSwap(amount, recipientAddress, expiry = 24) {
    try {
      // Validate recipient address
      const addressInfo = await this.rpcCall('getaddressinfo', [recipientAddress]);
      if (!addressInfo || !addressInfo.ismine) {
        throw new Error('Recipient address is not in this wallet');
      }
      
      // Validate amount and check balance
      const amountSatoshis = this.validateAmount(amount);
      await this.checkBalance(amount);
      
      // Generate a new address for the refund
      const refundAddress = await this.rpcCall('getnewaddress', ['swap_refund', 'bech32']);
      
      // Generate secret and hash
      const { secret, hash } = this.litecoinHTLC.generateSecret();
      
      // Calculate locktime (current time + expiry hours in seconds)
      const locktime = Math.floor(Date.now() / 1000) + (expiry * 3600);
      
      // Create HTLC contract
      const script = this.litecoinHTLC.createHTLCScript(
        recipientAddress,
        refundAddress,
        hash,
        locktime
      );
      
      // Get the P2SH address for the HTLC
      const htlcAddress = this.litecoinHTLC.getHTLCAddress(script);
      
      // Generate a new address to receive the HTLC
      const htlcReceiveAddress = await this.rpcCall('getnewaddress', ['htlc_receive', 'bech32']);
      
      // Store swap details
      const swapId = crypto.randomBytes(16).toString('hex');
      this.swaps.set(swapId, {
        id: swapId,
        status: 'pending',
        secret: secret,
        hash: hash,
        htlcAddress: htlcAddress,
        script: script.toString('hex'),
        amount: amountSatoshis,
        amountLTC: amount,
        expiry: locktime,
        recipient: recipientAddress,
        refundAddress: refundAddress,
        createdAt: Math.floor(Date.now() / 1000)
      });
      
      // Create the funding transaction
      const rawTx = await this.rpcCall('createrawtransaction', [
        [], // No inputs (let Litecoin Core choose)
        [
          {
            [htlcAddress]: amount,
            [htlcReceiveAddress]: 0.00001 // Dust amount to detect funding
          }
        ],
        0, // Locktime
        true // Replaceable
      ]);
      
      // Fund the transaction (selects UTXOs and adds change output)
      const fundedTx = await this.rpcCall('fundrawtransaction', [
        rawTx,
        {
          feeRate: this.config.feeRate,
          changeAddress: refundAddress,
          includeWatching: true
        }
      ]);
      
      // Sign the transaction
      const signedTx = await this.rpcCall('signrawtransactionwithwallet', [
        fundedTx.hex
      ]);
      
      if (!signedTx.complete) {
        throw new Error('Failed to sign transaction');
      }
      
      // Store the funding transaction ID
      const txid = await this.rpcCall('sendrawtransaction', [signedTx.hex]);
      
      // Update swap with transaction details
      const swap = this.swaps.get(swapId);
      swap.fundingTxId = txid;
      swap.status = 'funded';
      this.swaps.set(swapId, swap);
      
      return {
        status: 'pending',
        swapId: swapId,
        htlcAddress: htlcAddress,
        hash: hash,
        script: script.toString('hex'),
        amount: amount,
        fundingTxId: txid,
        expiry: locktime,
        recipient: recipientAddress,
        refundAddress: refundAddress
      };
      
    } catch (error) {
      console.error('Error initiating swap:', error);
      throw new Error(`Failed to initiate swap: ${error.message}`);
    }
  }

  // Participate in a swap (Participant side)
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
