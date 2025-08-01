const bitcoin = require('bitcoinjs-lib');
const litecore = require('litecore-lib');
const crypto = require('crypto');

class LitecoinHTLC {
  constructor(network = 'testnet') {
    this.network = network === 'testnet' ? litecore.Networks.testnet : litecore.Networks.livenet;
    this.bitcoinNetwork = network === 'testnet' ? 
      bitcoin.networks.testnet : 
      bitcoin.networks.bitcoin;
  }

  // Generate a random secret and its hash
  generateSecret() {
    const secret = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(secret).digest('hex');
    return { secret, hash };
  }

  // Create HTLC contract
  createHTLCScript(recipientAddress, refundAddress, hash, expiry) {
    const script = new litecore.Script();
    
    // OP_IF
    //   OP_HASH160 <hash> OP_EQUALVERIFY
    //   OP_DUP OP_HASH160 <recipient pubkey hash> OP_EQUAL
    // OP_ELSE
    //   <expiry> OP_CHECKLOCKTIMEVERIFY OP_DROP
    //   OP_DUP OP_HASH160 <refund pubkey hash> OP_EQUAL
    // OP_ENDIF
    // OP_CHECKSIG
    
    return script
      .add(bitcoin.opcodes.OP_IF)
      .add(Buffer.from(hash, 'hex'))
      .add(bitcoin.opcodes.OP_EQUALVERIFY)
      .add(bitcoin.opcodes.OP_DUP)
      .add(bitcoin.opcodes.OP_HASH160)
      .add(litecore.Address.fromString(recipientAddress).hashBuffer)
      .add(bitcoin.opcodes.OP_EQUALVERIFY)
      .add(bitcoin.opcodes.OP_ELSE)
      .add(litecore.Script.buildNumber(expiry).toBuffer())
      .add(bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY)
      .add(bitcoin.opcodes.OP_DROP)
      .add(bitcoin.opcodes.OP_DUP)
      .add(bitcoin.opcodes.OP_HASH160)
      .add(litecore.Address.fromString(refundAddress).hashBuffer)
      .add(bitcoin.opcodes.OP_EQUAL)
      .add(bitcoin.opcodes.OP_ENDIF)
      .add(bitcoin.opcodes.OP_CHECKSIG);
  }

  // Generate HTLC address from script
  getHTLCAddress(script) {
    const scriptHash = litecore.crypto.Hash.sha256(script.toBuffer());
    const scriptPubKey = litecore.Script.buildScriptHashOut(scriptHash);
    return scriptPubKey.toAddress(this.network).toString();
  }
}

module.exports = LitecoinHTLC;
