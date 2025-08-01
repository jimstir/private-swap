// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {
  // Deploy EscrowDst first
  const EscrowDst = await hre.ethers.getContractFactory("EscrowDst");
  const escrowDst = await EscrowDst.deploy();
  await escrowDst.deployed();
  console.log(`EscrowDst deployed to: ${escrowDst.address}`);

  // Deploy SwapManager with WETH address (for mainnet: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2)
  const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // Change this for testnet
  const SwapManager = await hre.ethers.getContractFactory("SwapManager");
  const swapManager = await SwapManager.deploy(wethAddress);
  await swapManager.deployed();
  console.log(`SwapManager deployed to: ${swapManager.address}`);

  // Verify contracts on Etherscan
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("Waiting for block confirmations...");
    await escrowDst.deployTransaction.wait(6);
    await swapManager.deployTransaction.wait(6);

    console.log("Verifying EscrowDst...");
    await hre.run("verify:verify", {
      address: escrowDst.address,
      constructorArguments: [],
    });

    console.log("Verifying SwapManager...");
    await hre.run("verify:verify", {
      address: swapManager.address,
      constructorArguments: [wethAddress],
    });
  }

  console.log("Deployment completed!");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
