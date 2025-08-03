# 1Inch Privacy Enhanced Swap

A 1Inch Fusion+ swap between Ethereum network and Litecoin network with privacy enhancing for the resolver. Resolvers are able to fill orders without adversaries knowing their token balance.

## Features

- **Trustless Cross-Chain Swaps**: Swap between Ethereum and Litecoin without intermediaries
- **1inch Fusion Integration**: Get the best prices with MEV protection
- **HTLC Smart Contracts**: Secure atomic swaps using Hash Time-Locked Contracts
- **Auto-Relayer Service**: Automated order matching and settlement
- **Worker Wallets**: Decentralized order fulfillment network

## Documentation

For detailed setup and usage instructions, please see the [Setup Guide](./docs/SETUP.md).

## Prerequisites

### For Development
- Node.js 16.x or later
- Hardhat
- Git

### For Running a Relayer
- Ethereum Node (Infura/Alchemy/self-hosted)
- Litecoin Core with RPC enabled
- LTC and ETH for gas fees

### For End Users
- MetaMask or Web3 wallet
- LTC wallet

## Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/private-swap.git
cd private-swap
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit the .env file with your configuration
```

### 4. Compile Contracts
```bash
npx hardhat compile
```

### 5. Deploy Contracts
```bash
npx hardhat run scripts/deploy.js --network <network>
```

### 6. Start the Relayer
```bash
cd relayer
cp .env.example .env
# Edit the .env file with your configuration
npm install
node index.js
```

## Litecoin Core Setup

## Architecture

### Smart Contracts

1. **SwapManager**: Main contract that manages the swap lifecycle
2. **EscrowDst**: Holds funds in escrow during the swap
3. **WorkerWallet**: Manages worker nodes that fulfill orders

### Relayer Service

Monitors both Ethereum and Litecoin blockchains for:
- New swap orders
- HTLC transactions on Litecoin
- Order expirations and refunds

### HTLC Implementation

Litecoin HTLC script structure:
```
OP_IF
  [HASHOP] <hash> OP_EQUALVERIFY
  OP_DUP OP_HASH160 <recipientPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
OP_ELSE
  <locktime> [TIMELOCK] OP_CHECKSEQUENCEVERIFY OP_DROP
  OP_DUP OP_HASH160 <senderPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
OP_ENDIF
```

## Usage Examples

### 1. Create a Cross-Chain Swap

```javascript
// Using ethers.js
const swapManager = new ethers.Contract(swapManagerAddress, swapManagerAbi, signer);

// Create a new cross-chain swap
const tx = await swapManager.createCrossChainOrder(
  tokenIn,        // Address of the token to swap from (0x0 for ETH)
  tokenOut,       // Address of the token to receive (0x0 for LTC)
  amountIn,       // Amount to swap (in wei)
  amountOutMin,   // Minimum amount to receive (in satoshis)
  deadline,       // Swap deadline (unix timestamp)
  secretHash,     // keccak256 hash of the secret
  ltcAmount,      // Amount of LTC to receive (in satoshis)
  ltcTimeout      // LTC HTLC timeout (unix timestamp)
);

await tx.wait();
```

### 2. Fulfill a Swap (Relayer)

```javascript
// Using the relayer service
// The relayer will automatically detect and fulfill eligible swaps
```

### 3. Refund an Expired Swap

```javascript
// Call refundOrder after the deadline has passed
const tx = await swapManager.refundOrder(orderId);
await tx.wait();
```


## License

MIT

