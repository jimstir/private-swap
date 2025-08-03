# Private Swap Setup Guide

This guide explains how to set up the required services for the Private Swap application, including Litecoin testnet and Ethereum Sepolia testnet.

## Prerequisites

1. **Litecoin Core** (for Litecoin testnet)
2. **Ethereum Node** (or use a service like Infura for Sepolia)
3. **Node.js** (v16 or later)
4. **Yarn** or **npm**

## 1. Litecoin Testnet Setup

### Install Litecoin Core

```bash
# On macOS (using Homebrew)
brew install litecoin

# Or download from https://litecoin.org/
```

### Configure Litecoin Core for Testnet

Create or edit `~/.litecoin/litecoin.conf`:

```ini
testnet=1
server=1
txindex=1
rpcuser=your_username
rpcpassword=your_secure_password
rpcport=19332
rpcallowip=127.0.0.1
rpcbind=127.0.0.1
```

### Start Litecoin Testnet Node

```bash
litecoind -testnet -daemon
```

### Verify Litecoin Testnet Sync

```bash
litecoin-cli -testnet getblockchaininfo
```

## 2. Ethereum Sepolia Testnet Setup with MetaMask

### Setup MetaMask

1. Install the [MetaMask extension](https://metamask.io/download/) if you haven't already
2. Create a new wallet or import an existing one
3. Switch to the Sepolia test network:
   - Click the network dropdown in MetaMask
   - Select "Show test networks"
   - Choose "Sepolia" from the list

### Get Test ETH

1. Open MetaMask and copy your wallet address
2. Get test ETH from a Sepolia faucet:
   - https://sepoliafaucet.com/
   - https://faucet.sepolia.dev/
   - https://sepolia-faucet.pk910.de/ (PoW faucet)

## 3. Environment Configuration

Create a `.env` file in the project root:

```env
# Litecoin RPC
LITECOIN_RPC_USER=your_username
LITECOIN_RPC_PASSWORD=your_secure_password
LITECOIN_RPC_HOST=127.0.0.1
LITECOIN_RPC_PORT=19332
LITECOIN_WALLET=swap_wallet
LITECOIN_NETWORK=testnet

# Ethereum Sepolia (MetaMask)
# No need to set private key - MetaMask will handle the connection
ETHEREUM_NETWORK=sepolia
ETHEREUM_CHAIN_ID=11155111

# Application
LOG_LEVEL=debug
```

## 4. Initialize the Project

```bash
# Install dependencies
yarn install

# Or with npm
npm install

# Create Litecoin wallet
litecoin-cli -testnet createwallet "swap_wallet"

# Get a new Litecoin testnet address
litecoin-cli -testnet -rpcwallet=swap_wallet getnewaddress "swap_wallet"
```

## 5. Running the Services

### Start the Relayer

```bash
node src/relayer.js
```

### Start a Resolver

In a new terminal:

```bash
node src/resolver.js
```

### Run Tests

```bash
# Run all tests
yarn test

# Or run specific test file
yarn test test/relayerTest.js
```

## Testing Steps

1. Litecoin Node Setup:

- Edit litecoin.conf with testnet settings
- Start litecoind:

```bash

litecoind -testnet -daemon
Create/load a wallet:
```

```bash
litecoin-cli -testnet createwallet "swap_wallet"
litecoin-cli -testnet loadwallet
```

2. Ethereum Wallet:

- Open MetaMask in your browser
- Switch to Sepolia testnet
- Ensure you have test ETH or create an ERC20 token

3. Start Services (in separate terminal windows):

- Resolver (can run multiple instances for testing):

```bash
node src/resolver.js
```
Relayer (single instance):

```bash
node src/relayer.js
```

4. Create a Swap:

Use the CLI to create a swap:

```bash
node src/index.js create 0.1 0xRecipientEthAddress --type ltc-to-eth
```
or

```bash
node src/index.js create 0.1 0xRecipientEthAddress --type eth-to-ltc
```


## Troubleshooting

### Litecoin RPC Connection Issues
- Ensure `litecoind` is running: `ps aux | grep litecoind`
- Check RPC credentials in `~/.litecoin/litecoin.conf`
- Verify the wallet is loaded: `litecoin-cli -testnet listwallets`

### Ethereum Connection Issues
- Verify your RPC URL is correct
- Ensure you have test ETH in your wallet
- Check if your node is synced

