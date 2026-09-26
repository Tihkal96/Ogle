'use strict';
const crypto = require('node:crypto');
const HEX = /^[a-f0-9]{64}$/;
// Mutual challenge authentication never exposes the persistent secret to a
// squatted pipe. Directional authenticated encryption prevents a relay from
// injecting, replaying, modifying, or reading administrator terminal frames.
class AdminChannel {
  constructor(role, token) { if (!['client', 'server'].includes(role) || !HEX.test(token)) throw new Error('Invalid administrator channel.'); this.role = role; this.secret = Buffer.from(token, 'hex'); this.sent = 0; this.received = 0; this.established = false; this.stage = 0; }
  proof(role) { return crypto.createHmac('sha256', this.secret).update(`ogle-admin-v1:${role}:${this.client}:${this.server}`).digest('hex'); }
  verify(value, role) { if (!HEX.test(value || '') || !crypto.timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(this.proof(role), 'hex'))) throw new Error('Administrator helper authentication failed.'); }
  keys() {
    const salt = Buffer.from(this.client + this.server, 'hex');
    this.outKey = Buffer.from(crypto.hkdfSync('sha256', this.secret, salt, `ogle-admin-v1:${this.role}`, 32));
    this.inKey = Buffer.from(crypto.hkdfSync('sha256', this.secret, salt, `ogle-admin-v1:${this.role === 'client' ? 'server' : 'client'}`, 32));
    this.established = true;
  }
  start() { if (this.role !== 'client' || this.stage) throw new Error('Invalid administrator handshake.'); this.stage = 1; this.client = crypto.randomBytes(32).toString('hex'); return { hello: this.client }; }
  handshake(message) {
    if (this.role === 'server' && this.stage === 0 && HEX.test(message.hello || '')) { this.client = message.hello; this.server = crypto.randomBytes(32).toString('hex'); this.stage = 1; return { challenge: this.server, proof: this.proof('server') }; }
    if (this.role === 'client' && this.stage === 1 && HEX.test(message.challenge || '')) { this.server = message.challenge; this.verify(message.proof, 'server'); const reply = { proof: this.proof('client') }; this.keys(); this.stage = 2; return reply; }
    if (this.role === 'server' && this.stage === 1) { this.verify(message.proof, 'client'); this.keys(); this.stage = 2; return null; }
    throw new Error('Invalid administrator handshake.');
  }
  iv(sequence) { const iv = Buffer.alloc(12); iv.writeBigUInt64BE(BigInt(sequence), 4); return iv; }
  seal(message) {
    if (!this.established) throw new Error('Administrator channel is not authenticated.');
    const seq = this.sent++, cipher = crypto.createCipheriv('aes-256-gcm', this.outKey, this.iv(seq));
    const data = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);
    return { seq, data: data.toString('base64'), tag: cipher.getAuthTag().toString('hex') };
  }
  open(frame) {
    if (!this.established || frame.seq !== this.received || typeof frame.data !== 'string' || frame.data.length > 2 * 1024 * 1024 || !/^[a-f0-9]{32}$/.test(frame.tag || '')) throw new Error('Invalid administrator channel frame.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.inKey, this.iv(frame.seq));
    decipher.setAuthTag(Buffer.from(frame.tag, 'hex'));
    const message = JSON.parse(Buffer.concat([decipher.update(Buffer.from(frame.data, 'base64')), decipher.final()]).toString('utf8'));
    this.received++; return message;
  }
}
module.exports = { AdminChannel };
