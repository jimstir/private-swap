const litecore = require('litecore-lib');
const Mnemonic = require('litecore-mnemonic');

class LitecoinWallet {
  constructor(network = 'testnet') {
    this.network = network === 'testnet' ? litecore.Networks.testnet : litecore.Networks.livenet;
    this.networkName = network;
  }

  // Generate a new wallet with mnemonic
  generateWallet() {
    const mnemonic = new Mnemonic();
    const hdPrivateKey = mnemonic.toHDPrivateKey('', this.network);
    
    return {
      mnemonic: mnemonic.toString(),
      privateKey: hdPrivateKey.privateKey.toString(),
      address: hdPrivateKey.privateKey.toAddress(this.network).toString()
    };
  }

  // Import wallet from mnemonic
  fromMnemonic(mnemonic) {
    if (!Mnemonic.isValid(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }
    
    const hdPrivateKey = new Mnemonic(mnemonic).toHDPrivateKey('', this.network);
    
    return {
      mnemonic: mnemonic,
      privateKey: hdPrivateKey.privateKey.toString(),
      address: hdPrivateKey.privateKey.toAddress(this.network).toString()
    };
  }

  // Sign a transaction
  signTransaction(tx, privateKey) {
    const privateKeyObj = new litecore.PrivateKey(privateKey);
    const transaction = new litecore.Transaction(tx);
    
    // Sign all inputs
    transaction.sign(privateKeyObj);
    
    return transaction.serialize();
  }

  // Create a funding transaction for HTLC
  createFundingTransaction(utxos, amount, htlcAddress, fee = 10000) {
    const tx = new litecore.Transaction()
      .from(utxos)
      .to(htlcAddress, amount)
      .fee(fee)
      .change(this.fromMnemonic(utxos[0].address).address);
      
    return tx.uncheckedSerialize();
  }
}

module.exports = LitecoinWallet;
