const bitcoin = require('bitcoinjs-lib');
const crypto = require('crypto');

class LitecoinHTLC {
  constructor(network = 'testnet') {
    // Use bitcoinjs-lib's network params for Litecoin testnet
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

  // Generate a random secret and its hash
  generateSecret() {
    const secret = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(secret).digest('hex');
    return { secret, hash };
  }

  // Create HTLC contract
  createHTLCScript(recipientPubKeyHash, refundPubKeyHash, hash, expiry) {
    // All hashes must be buffers
    // recipientPubKeyHash, refundPubKeyHash: Buffer (20 bytes)
    // hash: Buffer (20 bytes for HASH160, 32 bytes for SHA256)
    // expiry: integer (block height or timestamp)
    const script = bitcoin.script.compile([
      bitcoin.opcodes.OP_IF,
        bitcoin.opcodes.OP_SHA256,
        Buffer.from(hash, 'hex'),
        bitcoin.opcodes.OP_EQUALVERIFY,
        bitcoin.opcodes.OP_DUP,
        bitcoin.opcodes.OP_HASH160,
        Buffer.from(recipientPubKeyHash, 'hex'),
        bitcoin.opcodes.OP_EQUAL,
      bitcoin.opcodes.OP_ELSE,
        bitcoin.script.number.encode(expiry),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        bitcoin.opcodes.OP_DUP,
        bitcoin.opcodes.OP_HASH160,
        Buffer.from(refundPubKeyHash, 'hex'),
        bitcoin.opcodes.OP_EQUAL,
      bitcoin.opcodes.OP_ENDIF,
      bitcoin.opcodes.OP_CHECKSIG
    ]);
    return script;
  }

  // Generate HTLC address from script
  getHTLCAddress(script) {
    // Use P2SH for script hash
    const p2sh = bitcoin.payments.p2sh({ redeem: { output: script, network: this.bitcoinNetwork }, network: this.bitcoinNetwork });
    return p2sh.address;
  }
}

module.exports = LitecoinHTLC;
