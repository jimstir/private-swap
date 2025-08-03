## Litecoin Node Setup

### 1. Install Litecoin Core
Download and install [Litecoin Core](https://litecoin.org/).

### 2. Configure litecoin.conf
Create or edit `~/.litecoin/litecoin.conf`:
```ini
testnet=1
server=1
rpcuser=your_secure_username
rpcpassword=your_secure_password
rpcallowip=127.0.0.1
rpcport=19332
txindex=1
```

### 3. Restart Litecoin Core
Restart Litecoin Core to apply the configuration changes.

### 4. Verify Configuration
Verify that Litecoin Core is running and connected to the testnet:
```bash
litecoin-cli getnetworkinfo
```
