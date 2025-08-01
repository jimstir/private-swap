const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WorkerWallet", function () {
    let owner, user1, user2, token, swapManager, workerWalletFactory, weth;
    
    before(async function() {
        [owner, user1, user2] = await ethers.getSigners();
        
        // Deploy ERC20 mock
        const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
        token = await ERC20Mock.deploy("Test Token", "TST", 18);
        await token.deployed();

        // Deploy WETH
        const WETH = await ethers.getContractFactory("WETH9");
        weth = await WETH.deploy();
        await weth.deployed();

        // Deploy SwapManager
        const SwapManager = await ethers.getContractFactory("SwapManager");
        swapManager = await SwapManager.deploy(weth.address);
        await swapManager.deployed();

        // Deploy WorkerWalletFactory
        const WorkerWalletFactory = await ethers.getContractFactory("WorkerWalletFactory");
        workerWalletFactory = await WorkerWalletFactory.deploy();
        await workerWalletFactory.deployed();
    });

    describe("WorkerWalletFactory", function () {
        it("should deploy a new worker wallet", async function () {
            // Create a new worker wallet
            const tx = await workerWalletFactory.createWorkerWallet(owner.address, swapManager.address);
            const receipt = await tx.wait();
            
            // Check if WorkerWalletCreated event was emitted
            const event = receipt.events.find(e => e.event === 'WorkerWalletCreated');
            expect(event).to.not.be.undefined;
            
            const workerWalletAddress = event.args.wallet;
            expect(await workerWalletFactory.getWorkerWallet(owner.address)).to.equal(workerWalletAddress);
            expect(await workerWalletFactory.isWorkerWallet(workerWalletAddress)).to.be.true;
        });

        it("should not allow creating multiple wallets for the same owner", async function () {
            // Create first wallet
            await workerWalletFactory.createWorkerWallet(user1.address, swapManager.address);
            
            // Try to create another wallet for the same owner
            await expect(
                workerWalletFactory.createWorkerWallet(user1.address, swapManager.address)
            ).to.be.revertedWith("WorkerWalletFactory: wallet already exists");
        });
    });

    describe("WorkerWallet", function () {
        it("should execute transactions when called by owner", async function () {
            // Create a new worker wallet
            await workerWalletFactory.createWorkerWallet(user2.address, swapManager.address);
            const workerWalletAddress = await workerWalletFactory.getWorkerWallet(user2.address);
            const workerWallet = await ethers.getContractAt("WorkerWallet", workerWalletAddress);
            
            // Mint some tokens to the worker wallet
            const amount = ethers.utils.parseEther("100");
            await token.mint(workerWalletAddress, amount);
            
            // Execute a transfer from the worker wallet
            const transferAmount = ethers.utils.parseEther("10");
            const transferData = token.interface.encodeFunctionData("transfer", [user1.address, transferAmount]);
            
            await workerWallet.connect(user2).execute(token.address, 0, transferData);
            
            // Verify token balances
            const workerBalance = await token.balanceOf(workerWalletAddress);
            const user1Balance = await token.balanceOf(user1.address);
            expect(workerBalance.toString()).to.equal(amount.sub(transferAmount).toString());
            expect(user1Balance.toString()).to.equal(transferAmount.toString());
        });

        it("should not execute transactions when called by non-owner", async function () {
            const workerWalletAddress = await workerWalletFactory.getWorkerWallet(user2.address);
            const workerWallet = await ethers.getContractAt("WorkerWallet", workerWalletAddress);
            
            // Try to execute a transfer from the worker wallet as a non-owner
            const transferData = token.interface.encodeFunctionData("transfer", [user1.address, 100]);
            
            await expect(
                workerWallet.connect(owner).execute(token.address, 0, transferData)
            ).to.be.revertedWith("WorkerWallet: caller is not the owner");
        });

        it("should allow owner to withdraw funds", async function () {
            const workerWalletAddress = await workerWalletFactory.getWorkerWallet(user2.address);
            const workerWallet = await ethers.getContractAt("WorkerWallet", workerWalletAddress);
            
            // Get current balance of the worker wallet
            const initialBalance = await token.balanceOf(workerWalletAddress);
            
            // Withdraw tokens to owner
            await workerWallet.connect(user2).withdraw(token.address, initialBalance, user2.address);
            
            // Verify token balances after withdrawal
            const workerBalance = await token.balanceOf(workerWalletAddress);
            const ownerBalance = await token.balanceOf(user2.address);
            expect(workerBalance.toString()).to.equal('0');
            expect(ownerBalance.toString()).to.equal(initialBalance.toString());
        });
    });
});
