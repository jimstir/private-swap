const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

// Helper function to generate a random secret and its hash
function generateSecret() {
  const secret = ethers.utils.randomBytes(32);
  const secretHash = ethers.utils.keccak256(secret);
  return { secret, secretHash };
}

describe("CrossChainSwap", function () {
  let owner, user1, user2;
  let tokenIn, tokenOut;
  let swapManager, escrowDst;
  
  // Test constants
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ETH_AMOUNT = ethers.utils.parseEther("1.0");
  const LTC_AMOUNT = 100000000; // 1 LTC in satoshis
  const DEADLINE = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const LTC_TIMEOUT = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now

  before(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy test ERC20 tokens
    const Token = await ethers.getContractFactory("ERC20Mock");
    tokenIn = await Token.deploy("Test Token In", "TTI", owner.address, ethers.utils.parseEther("1000"));
    tokenOut = await Token.deploy("Test Token Out", "TTO", owner.address, ethers.utils.parseEther("1000"));
    
    // Deploy EscrowDst
    const EscrowDst = await ethers.getContractFactory("EscrowDst");
    escrowDst = await EscrowDst.deploy();
    
    // Deploy SwapManager with WETH address (using zero address for tests)
    const SwapManager = await ethers.getContractFactory("SwapManager");
    swapManager = await SwapManager.deploy(ZERO_ADDRESS);
    
    // Transfer some tokens to user1 for testing
    await tokenIn.transfer(user1.address, ethers.utils.parseEther("100"));
    await tokenOut.transfer(user2.address, ethers.utils.parseEther("100"));
  });

  describe("ETH to LTC Swap", function () {
    it("Should create a new cross-chain swap", async function () {
      const { secret, secretHash } = generateSecret();
      
      // User1 creates a swap to exchange ETH for LTC
      const tx = await swapManager.connect(user1).createCrossChainOrder(
        ZERO_ADDRESS, // ETH
        ZERO_ADDRESS, // LTC (represented as address(0))
        ETH_AMOUNT,   // 1 ETH
        LTC_AMOUNT,   // 1 LTC
        DEADLINE,     // 1 hour deadline
        secretHash,    // Hash of the secret
        LTC_AMOUNT,   // Amount of LTC to receive
        LTC_TIMEOUT,  // 2 hour timeout for LTC HTLC
        { value: ETH_AMOUNT } // Send ETH with the transaction
      );
      
      // Get the order ID from the transaction receipt
      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === "CrossChainOrderCreated");
      const orderId = event.args.orderId;
      
      // Verify the order was created
      const order = await swapManager.getOrder(orderId);
      expect(order.initiator).to.equal(user1.address);
      expect(order.tokenIn).to.equal(ZERO_ADDRESS);
      expect(order.amountIn).to.equal(ETH_AMOUNT);
      expect(order.secretHash).to.equal(secretHash);
      expect(order.isFulfilled).to.be.false;
      expect(order.isRefunded).to.be.false;
    });
    
    it("Should fulfill a cross-chain swap", async function () {
      const { secret, secretHash } = generateSecret();
      
      // User1 creates a swap
      const tx = await swapManager.connect(user1).createCrossChainOrder(
        ZERO_ADDRESS, // ETH
        ZERO_ADDRESS, // LTC
        ETH_AMOUNT,   // 1 ETH
        LTC_AMOUNT,   // 1 LTC
        DEADLINE,
        secretHash,
        LTC_AMOUNT,
        LTC_TIMEOUT,
        { value: ETH_AMOUNT }
      );
      
      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === "CrossChainOrderCreated");
      const orderId = event.args.orderId;
      
      // In a real scenario, the relayer would detect the LTC payment
      // and call fulfillCrossChainOrder with the secret
      const fulfillTx = await swapManager.connect(user2).fulfillCrossChainOrder(
        orderId,
        secretHash // In a real scenario, this would be the actual secret, not the hash
      );
      
      await expect(fulfillTx)
        .to.emit(swapManager, "CrossChainOrderFulfilled")
        .withArgs(orderId, user2.address, secretHash);
      
      // Verify the order is fulfilled
      const order = await swapManager.getOrder(orderId);
      expect(order.isFulfilled).to.be.true;
      expect(order.resolver).to.equal(user2.address);
    });
    
    it("Should refund an expired order", async function () {
      const { secretHash } = generateSecret();
      
      // Create a swap with a deadline in the past
      const pastDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const tx = await swapManager.connect(user1).createCrossChainOrder(
        ZERO_ADDRESS, // ETH
        ZERO_ADDRESS, // LTC
        ETH_AMOUNT,
        LTC_AMOUNT,
        pastDeadline, // Already expired
        secretHash,
        LTC_AMOUNT,
        LTC_TIMEOUT,
        { value: ETH_AMOUNT }
      );
      
      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === "CrossChainOrderCreated");
      const orderId = event.args.orderId;
      
      // User1 should be able to refund the order
      await expect(swapManager.connect(user1).refundOrder(orderId))
        .to.emit(swapManager, "OrderRefunded")
        .withArgs(orderId);
      
      // Verify the order is refunded
      const order = await swapManager.getOrder(orderId);
      expect(order.isRefunded).to.be.true;
    });
  });
  
  describe("ERC20 to LTC Swap", function () {
    it("Should create a new ERC20 to LTC swap", async function () {
      const { secretHash } = generateSecret();
      const swapAmount = ethers.utils.parseEther("100");
      
      // Approve the SwapManager to spend user1's tokens
      await tokenIn.connect(user1).approve(swapManager.address, swapAmount);
      
      // User1 creates a swap to exchange ERC20 for LTC
      await swapManager.connect(user1).createCrossChainOrder(
        tokenIn.address, // ERC20 token
        ZERO_ADDRESS,    // LTC
        swapAmount,      // 100 tokens
        LTC_AMOUNT,      // 1 LTC
        DEADLINE,
        secretHash,
        LTC_AMOUNT,
        LTC_TIMEOUT
      );
      
      // Verify the tokens were transferred to the escrow
      const escrowBalance = await tokenIn.balanceOf(escrowDst.address);
      expect(escrowBalance).to.equal(swapAmount);
    });
  });
});
