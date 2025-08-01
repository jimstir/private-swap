const bitcoin = require('bitcoinjs-lib');
const bitcoinMessage = require('bitcoinjs-message');
const { sha256 } = require('bitcoinjs-lib/src/crypto');

// Litecoin network parameters
const litecoinNetworks = {
  testnet: {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bip32: { 
      public: 0x0436f6e1,
      private: 0x0436ef7d 
    },
    pubKeyHash: 0x6f,  // 'm' or 'n' addresses
    scriptHash: 0xc4,  // 'Q' addresses
    wif: 0xef
  },
  mainnet: {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bip32: { 
      public: 0x019da462,
      private: 0x019d9cfe 
    },
    pubKeyHash: 0x30,  // 'L' addresses
    scriptHash: 0x32,  // 'M' addresses
    wif: 0xb0
  }
};

class LtcHtlc {
  /**
   * Generate HTLC redeem script
   * @param {string} senderPubKey - Sender's public key (hex)
   * @param {string} recipientPubKey - Recipient's public key (hex)
   * @param {string} hash - SHA256 hash of the secret (hex)
   * @param {number} locktime - Block height or timestamp for refund
   * @returns {string} - Hex-encoded redeem script
   */
  static createHtlcScript(senderPubKey, recipientPubKey, hash, locktime) {
    // OP_IF
    //   OP_SHA256 <hash> OP_EQUALVERIFY
    //   OP_DUP OP_HASH160 <recipientPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
    // OP_ELSE
    //   <locktime> [OP_CHECKSEQUENCEVERIFY/OP_CHECKLOCKTIMEVERIFY] OP_DROP
    //   OP_DUP OP_HASH160 <senderPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
    // OP_ENDIF
    
    // Convert hex strings to buffers
    const hashBuffer = Buffer.from(hash, 'hex');
    const recipientPubKeyBuffer = Buffer.from(recipientPubKey, 'hex');
    const senderPubKeyBuffer = Buffer.from(senderPubKey, 'hex');
    
    // Create script chunks
    const scriptChunks = [
      bitcoin.script.OPS.OP_IF,
      bitcoin.script.OPS.OP_SHA256,
      hashBuffer,
      bitcoin.script.OPS.OP_EQUALVERIFY,
      bitcoin.script.OPS.OP_DUP,
      bitcoin.script.OPS.OP_HASH160,
      bitcoin.crypto.hash160(recipientPubKeyBuffer),
      bitcoin.script.OPS.OP_EQUALVERIFY,
      bitcoin.script.OPS.OP_CHECKSIG,
      bitcoin.script.OPS.OP_ELSE,
      bitcoin.script.number.encode(locktime),
      locktime < 500000000 ? 
        bitcoin.script.OPS.OP_CHECKSEQUENCEVERIFY : 
        bitcoin.script.OPS.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.script.OPS.OP_DROP,
      bitcoin.script.OPS.OP_DUP,
      bitcoin.script.OPS.OP_HASH160,
      bitcoin.crypto.hash160(senderPubKeyBuffer),
      bitcoin.script.OPS.OP_EQUALVERIFY,
      bitcoin.script.OPS.OP_CHECKSIG,
      bitcoin.script.OPS.OP_ENDIF
    ];
    
    // Compile the script
    const script = bitcoin.script.compile(scriptChunks);
    
    // Verify the script is valid
    try {
      bitcoin.script.decompile(script);
      return script.toString('hex');
    } catch (e) {
      throw new Error(`Invalid script generated: ${e.message}`);
    }
  }

  /**
   * Generate P2SH address from redeem script
   * @param {string} redeemScript - Hex-encoded redeem script
   * @param {string} network - Network type ('testnet' or 'mainnet')
   * @returns {string} - P2SH address
   */
  static getHtlcAddress(redeemScript, network = 'testnet') {
    const scriptBuffer = Buffer.from(redeemScript, 'hex');
    const scriptHash = bitcoin.crypto.hash160(scriptBuffer);
    const scriptPubKey = bitcoin.script.scriptHash.output.encode(scriptHash);
    
    const litecoinNetwork = litecoinNetworks[network] || litecoinNetworks.testnet;
    
    return bitcoin.address.fromOutputScript(
      scriptPubKey,
      litecoinNetwork
    );
  }

  /**
   * Create claim transaction
   * @param {string} redeemScript - Hex-encoded redeem script
   * @param {string} txid - Funding transaction ID
   * @param {number} vout - Output index in the funding transaction
   * @param {string} recipientAddress - Recipient's Litecoin address
   * @param {string} privateKey - Recipient's private key (WIF)
   * @param {string} secret - Secret to unlock the HTLC
   * @param {number} amount - Amount in litoshis
   * @param {string} network - Network type ('testnet' or 'mainnet')
   * @returns {Object} - Raw transaction and transaction ID
   */
  static createClaimTransaction(redeemScript, txid, vout, recipientAddress, privateKey, secret, amount, network = 'testnet') {
    const litecoinNetwork = litecoinNetworks[network] || litecoinNetworks.testnet;
    const txb = new bitcoin.TransactionBuilder(litecoinNetwork);
    const txHash = Buffer.from(txid, 'hex').reverse();
    
    // Add input (the HTLC output)
    txb.addInput(txHash, vout);
    
    // Calculate fee (example: 1000 litoshis)
    const fee = 1000;
    const amountAfterFee = amount - fee;
    
    // Add output to recipient
    txb.addOutput(recipientAddress, amountAfterFee);
    
    // Sign the transaction
    const keyPair = bitcoin.ECPair.fromWIF(privateKey, litecoinNetwork);
    const redeemScriptObj = Buffer.from(redeemScript, 'hex');
    
    // First signature (for the IF branch - claim with secret)
    txb.sign(0, keyPair, redeemScriptObj, null, amount, [
      Buffer.from(secret, 'hex'),
      Buffer.from(redeemScript, 'hex')
    ]);
    
    // Build the transaction
    const tx = txb.build();
    
    return {
      txid: tx.getId(),
      rawTx: tx.toHex()
    };
  }

  /**
   * Create refund transaction
   * @param {string} redeemScript - Hex-encoded redeem script
   * @param {string} txid - Funding transaction ID
   * @param {number} vout - Output index in the funding transaction
   * @param {string} refundAddress - Refund address
   * @param {string} privateKey - Sender's private key (WIF)
   * @param {number} amount - Amount in litoshis
   * @param {number} locktime - Locktime for the refund
   * @param {string} network - Network type ('testnet' or 'mainnet')
   * @returns {Object} - Raw transaction and transaction ID
   */
  static createRefundTransaction(redeemScript, txid, vout, refundAddress, privateKey, amount, locktime, network = 'testnet') {
    const litecoinNetwork = litecoinNetworks[network] || litecoinNetworks.testnet;
    const txb = new bitcoin.TransactionBuilder(litecoinNetwork);
    const txHash = Buffer.from(txid, 'hex').reverse();
    
    // Add input (the HTLC output) with sequence number for relative timelock
    const sequence = locktime < 500000000 ? locktime : 0;
    txb.addInput(txHash, vout, sequence);
    
    // Set locktime for absolute timelock if needed
    if (locktime >= 500000000) {
      txb.setLockTime(locktime);
    }
    
    // Calculate fee (example: 1000 litoshis)
    const fee = 1000;
    const amountAfterFee = amount - fee;
    
    // Add output to refund address
    txb.addOutput(refundAddress, amountAfterFee);
    
    // Sign the transaction
    const keyPair = bitcoin.ECPair.fromWIF(privateKey, litecoinNetwork);
    const redeemScriptObj = Buffer.from(redeemScript, 'hex');
    
    // Sign for the ELSE branch (refund path)
    txb.sign(0, keyPair, redeemScriptObj, null, amount, [
      Buffer.alloc(0), // Empty signature (required for the ELSE branch)
      Buffer.alloc(0), // Empty signature
      Buffer.from(redeemScript, 'hex')
    ]);
    
    // Build the transaction
    const tx = txb.build();
    
    return {
      txid: tx.getId(),
      rawTx: tx.toHex()
    };
  }
}

module.exports = LtcHtlc;
