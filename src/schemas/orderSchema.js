const crypto = require('crypto');
const { ethers } = require('ethers');

class OrderSchema {
  constructor(params) {
    this.version = '1.0';
    this.chainId = params.chainId || 1; // Default to Ethereum mainnet
    this.maker = params.maker;
    this.makerAsset = params.makerAsset;
    this.takerAsset = params.takerAsset;
    this.makingAmount = params.makingAmount.toString();
    this.takingAmount = params.takingAmount.toString();
    this.salt = params.salt || crypto.randomBytes(32).toString('hex');
    this.expiry = params.expiry || Math.floor(Date.now() / 1000) + 3600; // 1 hour default
    this.metadata = {
      secretHash: params.secretHash,
      swapType: params.swapType || 'cross-chain-atomic',
      ltcRefundAddress: params.ltcRefundAddress,
      ...params.metadata
    };
  }

  toJSON() {
    return {
      version: this.version,
      chainId: this.chainId,
      maker: this.maker,
      makerAsset: this.makerAsset,
      takerAsset: this.takerAsset,
      makingAmount: this.makingAmount,
      takingAmount: this.takingAmount,
      salt: this.salt,
      expiry: this.expiry,
      metadata: this.metadata
    };
  }

  // Generate a unique order ID
  getOrderId() {
    const orderData = JSON.stringify(this.toJSON());
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(orderData));
  }
}

module.exports = OrderSchema;
