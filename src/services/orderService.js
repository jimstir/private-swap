const { ethers } = require('ethers');
const OrderSchema = require('../schemas/orderSchema');

class OrderService {
  constructor(config = {}) {
    this.config = {
      defaultExpiry: 3600, // 1 hour in seconds
      ...config
    };
  }

  /**
   * Create a new ETH to LTC swap order
   * @param {Object} params - Order parameters
   * @returns {Object} The created order
   */
  async createEthToLtcOrder(params) {
    const {
      makerAddress,
      ethAmount,
      ltcAmount,
      secretHash,
      ltcRefundAddress,
      expiry = Math.floor(Date.now() / 1000) + this.config.defaultExpiry,
      targetLtcAddress,
      chainId = 1
    } = params;

    const order = new OrderSchema({
      chainId,
      maker: makerAddress,
      makerAsset: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
      takerAsset: '0x0000000000000000000000000000000000000000', // LTC placeholder
      makingAmount: ethers.utils.parseEther(ethAmount.toString()).toString(),
      takingAmount: Math.floor(ltcAmount * 1e8).toString(), // Convert to satoshis
      secretHash,
      ltcRefundAddress,
      expiry,
      metadata: {
        targetChain: 'litecoin',
        targetAsset: 'LTC',
        targetAddress: targetLtcAddress,
        swapDirection: 'eth-to-ltc'
      }
    });

    return order.toJSON();
  }

  /**
   * Create a new LTC to ETH swap order
   * @param {Object} params - Order parameters
   * @returns {Object} The created order
   */
  async createLtcToEthOrder(params) {
    const {
      makerAddress,
      ltcAmount,
      ethAmount,
      secretHash,
      ltcRefundAddress,
      expiry = Math.floor(Date.now() / 1000) + this.config.defaultExpiry,
      targetEthAddress,
      chainId = 1
    } = params;

    const order = new OrderSchema({
      chainId,
      maker: makerAddress,
      makerAsset: '0x0000000000000000000000000000000000000000', // LTC placeholder
      takerAsset: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
      makingAmount: Math.floor(ltcAmount * 1e8).toString(), // Convert to satoshis
      takingAmount: ethers.utils.parseEther(ethAmount.toString()).toString(),
      secretHash,
      ltcRefundAddress,
      expiry,
      metadata: {
        targetChain: 'ethereum',
        targetAsset: 'ETH',
        targetAddress: targetEthAddress,
        swapDirection: 'ltc-to-eth'
      }
    });

    return order.toJSON();
  }

  /**
   * Sign an order with the maker's private key
   * @param {Object} order - The order to sign
   * @param {string} privateKey - The maker's private key
   * @returns {Object} The signed order with signature
   */
  signOrder(order, privateKey) {
    const signer = new ethers.Wallet(privateKey);
    const orderHash = this.getOrderHash(order);
    const signature = signer.signMessage(ethers.utils.arrayify(orderHash));
    
    return {
      ...order,
      signature,
      orderHash: orderHash
    };
  }

  /**
   * Generate a deterministic hash for an order
   * @param {Object} order - The order to hash
   * @returns {string} The order hash
   */
  getOrderHash(order) {
    return ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
        [
          order.chainId,
          order.maker,
          order.makerAsset,
          order.makingAmount,
          order.takingAmount,
          order.expiry,
          ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(order.metadata)))
        ]
      )
    );
  }

  /**
   * Verify an order's signature
   * @param {Object} order - The order with signature
   * @returns {boolean} True if the signature is valid
   */
  verifyOrderSignature(order) {
    if (!order.signature) return false;
    
    const orderHash = this.getOrderHash(order);
    const signerAddress = ethers.utils.verifyMessage(
      ethers.utils.arrayify(orderHash),
      order.signature
    );
    
    return signerAddress.toLowerCase() === order.maker.toLowerCase();
  }
}

module.exports = OrderService;
