const bitcoin = require('bitcoinjs-lib');
const bip39 = require('bip39');

class LitecoinWallet {
  constructor(network = 'testnet') {
    this.bitcoinNetwork = network === 'testnet' ? {
      messagePrefix: '\x19Litecoin Signed Message:\n',
      bech32: 'tltc',
      bip32: { public: 0x043587cf, private: 0x04358394 },
      pubKeyHash: 0x6f,
      scriptHash: 0x3a,
      wif: 0xef,
    } : bitcoin.networks.bitcoin;
    this.networkName = network;
  }

  // Generate a new wallet with mnemonic
  async generateWallet() {
    const mnemonic = bip39.generateMnemonic();
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const node = bitcoin.bip32.fromSeed(seed, this.bitcoinNetwork);
    const child = node.derivePath("m/44'/2'/0'/0/0"); // Litecoin BIP44 path
    const { address } = bitcoin.payments.p2pkh({ pubkey: child.publicKey, network: this.bitcoinNetwork });
    return {
      mnemonic,
      privateKey: child.toWIF(),
      address
    };
  }

  // Import wallet from mnemonic
  async fromMnemonic(mnemonic) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }
    
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const node = bitcoin.bip32.fromSeed(seed, this.bitcoinNetwork);
    const child = node.derivePath("m/44'/2'/0'/0/0");
    const { address } = bitcoin.payments.p2pkh({ pubkey: child.publicKey, network: this.bitcoinNetwork });
    return {
      mnemonic,
      privateKey: child.toWIF(),
      address
    };
  }

  // Sign a transaction (simplified, assumes all inputs are P2PKH and uses bitcoinjs-lib)
  signTransaction(unsignedTxHex, privateKeyWIF) {
    const tx = bitcoin.Transaction.fromHex(unsignedTxHex);
    const txb = bitcoin.TransactionBuilder.fromTransaction(tx, this.bitcoinNetwork);
    const keyPair = bitcoin.ECPair.fromWIF(privateKeyWIF, this.bitcoinNetwork);
    for (let i = 0; i < tx.ins.length; i++) {
      txb.sign(i, keyPair);
    }
    return txb.build().toHex();
  }

  // Create a funding transaction for HTLC (simplified, assumes all UTXOs are P2PKH)
  createFundingTransaction(utxos, amount, htlcAddress, fee = 10000, changeAddress) {
    const txb = new bitcoin.TransactionBuilder(this.bitcoinNetwork);
    let totalIn = 0;
    utxos.forEach(utxo => {
      txb.addInput(utxo.txid, utxo.vout);
      totalIn += utxo.amount;
    });
    txb.addOutput(htlcAddress, amount);
    const change = totalIn - amount - fee;
    if (change > 0) {
      txb.addOutput(changeAddress, change);
    }
    // Note: Signing must be done separately with private keys for each UTXO
    return txb.buildIncomplete().toHex();
  }
}

module.exports = LitecoinWallet;
