const { expect } = require('chai');
const { ethers } = require('ethers');
const relayer = require('../relayer/inMemoryRelayer');
const Resolver = require('../src/resolver');
const { AtomicSwap } = require('../src/swap');

// Mock wallets for testing
const ethWallet1 = ethers.Wallet.createRandom();
const ethWallet2 = ethers.Wallet.createRandom();

// Mock Litecoin wallet
const ltcWallet1 = {
  address: 'LdP8Qox1AcQzWCnnR19EnFAS1EF6fCfJfP',
  getBalance: async () => '10.0' // 10 LTC
};

const ltcWallet2 = {
  address: 'LXwv6SzftTC1BDSyE73dR1JQEK9QZKCZfP',
  getBalance: async () => '5.0' // 5 LTC
};

describe('In-Memory Relayer System', () => {
  let swapService1, swapService2, resolver;

  before(() => {
    // Create swap services for two users
    swapService1 = new AtomicSwap({
      ethereum: ethWallet1,
      litecoin: ltcWallet1,
      network: 'testnet'
    });

    swapService2 = new AtomicSwap({
      ethereum: ethWallet2,
      litecoin: ltcWallet2,
      network: 'testnet'
    });

    // Create and start a resolver
    resolver = new Resolver({
      ethWallet: ethWallet2,
      ltcWallet: ltcWallet2,
      minProfit: '0.001', // Minimum 0.001 ETH profit
      maxSlippage: '0.01' // 1% max slippage
    });

    resolver.start();
  });

  it('should submit and process an ETH to LTC swap', async () => {
    // User 1 initiates an ETH to LTC swap
    const swapParams = {
      ethAmount: '1.0',
      ltcAmount: '100',
      ltcRecipient: ltcWallet1.address,
      expiry: 3600 // 1 hour
    };

    const result = await swapService1.initiateEthToLtcSwap(swapParams);
    
    // Verify the order was created
    expect(result).to.have.property('orderId');
    expect(result.status).to.equal('pending');

    // Check order status
    const orderStatus = await swapService1.getOrderStatus(result.orderId);
    expect(orderStatus).to.exist;
    expect(orderStatus.status).to.be.oneOf(['pending', 'accepted']);

    // Wait a bit for the resolver to process the order
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if order was accepted
    const updatedStatus = await swapService1.getOrderStatus(result.orderId);
    expect(updatedStatus.status).to.be.oneOf(['accepted', 'fulfilled']);
  });

  it('should submit and process an LTC to ETH swap', async () => {
    // User 2 initiates an LTC to ETH swap
    const swapParams = {
      ltcAmount: '50',
      ethAmount: '0.5',
      ethRecipient: ethWallet2.address,
      expiry: 3600 // 1 hour
    };

    const result = await swapService2.initiateLtcToEthSwap(swapParams);
    
    // Verify the order was created
    expect(result).to.have.property('orderId');
    expect(result.status).to.equal('pending');

    // Check order status
    const orderStatus = await swapService2.getOrderStatus(result.orderId);
    expect(orderStatus).to.exist;
    expect(orderStatus.status).to.be.oneOf(['pending', 'accepted']);

    // Wait a bit for the resolver to process the order
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if order was accepted
    const updatedStatus = await swapService2.getOrderStatus(result.orderId);
    expect(updatedStatus.status).to.be.oneOf(['accepted', 'fulfilled']);
  });
});
