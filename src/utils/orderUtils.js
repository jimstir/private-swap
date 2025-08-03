const { ethers } = require('ethers');
const { TypedDataUtils } = require('ethers-eip712');

/**
 * Convert a simple order to a 1inch-compatible order with EIP-712 signature
 * @param {Object} simpleOrder - The simple order format from swap.js
 * @param {ethers.Wallet} signer - The wallet to sign the order
 * @returns {Promise<Object>} The 1inch-compatible order with signature
 */
async function convertTo1InchOrder(simpleOrder, signer) {
  // Convert amounts to wei/satoshi as needed
  const makerAmount = ethers.utils.parseEther(
    simpleOrder.type === 'eth_to_ltc' ? simpleOrder.ethAmount : simpleOrder.ltcAmount
  );
  
  const takerAmount = ethers.utils.parseEther(
    simpleOrder.type === 'eth_to_ltc' ? simpleOrder.ltcAmount : simpleOrder.ethAmount
  );

  // Create the order data structure
  const orderData = {
    makerAsset: simpleOrder.type === 'eth_to_ltc' ? 
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : // ETH address
      '0x6B175474E89094C44Da98b954EedeAC495271d0F',  // DAI address (example)
    takerAsset: simpleOrder.type === 'eth_to_ltc' ?
      '0x6B175474E89094C44Da98b954EedeAC495271d0F' : // DAI address (example)
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',  // ETH address
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    maker: signer.address,
    taker: '0x0000000000000000000000000000000000000000', // Open order
    expiration: simpleOrder.expiry,
    salt: Date.now().toString(),
    feeRecipient: '0x0000000000000000000000000000000000000000', // No fee by default
    side: simpleOrder.type === 'eth_to_ltc' ? 0 : 1, // 0 = sell, 1 = buy
  };

  // EIP-712 typed data structure
  const domain = {
    name: '1inch Fusion',
    version: '1',
    chainId: await signer.getChainId(),
    verifyingContract: '0x1111111254EEB25477B68fb85Ed929f73A960582' // 1inch Fusion contract
  };

  const types = {
    Order: [
      { name: 'makerAsset', type: 'address' },
      { name: 'takerAsset', type: 'address' },
      { name: 'makerAmount', type: 'uint256' },
      { name: 'takerAmount', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'taker', type: 'address' },
      { name: 'expiration', type: 'uint256' },
      { name: 'salt', type: 'uint256' },
      { name: 'feeRecipient', type: 'address' },
      { name: 'side', type: 'uint8' }
    ]
  };

  // Sign the order
  const signature = await signer._signTypedData(domain, types, orderData);
  const { v, r, s } = ethers.utils.splitSignature(signature);

  // Return the 1inch-compatible order
  return {
    ...orderData,
    signatureType: 2, // EIP-712
    v,
    r,
    s,
    // Add the original order ID for reference
    metadata: {
      originalOrderId: simpleOrder.id,
      secretHash: simpleOrder.secretHash
    }
  };
}

/**
 * Convert a 1inch order to the format expected by SwapManager
 * @param {Object} inchOrder - The 1inch order with signature
 * @returns {Object} The order in SwapManager format
 */
function convertToSwapManagerFormat(inchOrder) {
  return {
    orderHash: ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'uint256', 'address', 'address', 'uint256', 'uint256'],
        [
          inchOrder.makerAsset,
          inchOrder.takerAsset,
          inchOrder.makerAmount,
          inchOrder.takerAmount,
          inchOrder.maker,
          inchOrder.taker,
          inchOrder.expiration,
          inchOrder.salt
        ]
      )
    ),
    makerAmount: inchOrder.makerAmount,
    takerAmount: inchOrder.takerAmount,
    threshold: 0, // No threshold for now
    maker: inchOrder.maker,
    taker: inchOrder.taker,
    salt: inchOrder.salt,
    expiry: inchOrder.expiration,
    v: inchOrder.v,
    r: inchOrder.r,
    s: inchOrder.s,
    // Include the original order metadata
    metadata: inchOrder.metadata
  };
}

module.exports = {
  convertTo1InchOrder,
  convertToSwapManagerFormat
};
