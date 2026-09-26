'use strict';
const net = require('node:net');
const { ElevatedBroker } = require('./elevated-broker.cjs');
const { AdminChannel } = require('./admin-channel.cjs');
class PersistentAdminBroker extends ElevatedBroker {
  constructor({ installation, onEvent }) { super({ onEvent }); this.installation = installation; this.epoch = 0; }
  dispose() { this.epoch++; super.dispose(); }
  send(message) { if (!this.socket || this.socket.destroyed) throw new Error('Administrator helper is disconnected'); this.socket.write(JSON.stringify(this.channel.seal(message)) + '\n'); }
  async _connect() {
    const epoch = this.epoch;
    const config = await this.installation.start();
    if (epoch !== this.epoch) throw new Error('Administrator helper connection cancelled.');
    return new Promise((resolve, reject) => {
      let finished = false, attemptTimer, socket;
      const timer = setTimeout(() => finish(new Error('Installed administrator helper did not respond. Remove and enable administrator access in Settings.')), 20000);
      const finish = error => {
        if (finished) return; finished = true;
        clearTimeout(timer); clearTimeout(attemptTimer); this.cancelConnect = null;
        if (error) { socket?.destroy(); reject(error); } else { this.onEvent({ event: 'broker-ready' }); resolve(); }
      };
      this.cancelConnect = () => finish(new Error('Administrator helper connection cancelled.'));
      const attempt = () => {
        if (finished) return;
        socket = net.connect(config.pipe); let buffer = '', ready = false, retry = false;
        const channel = new AdminChannel('client', config.token);
        socket.setEncoding('utf8');
        socket.on('connect', () => socket.write(JSON.stringify(channel.start()) + '\n'));
        socket.on('error', error => { if (!ready && ['ENOENT', 'ECONNREFUSED', 'EPIPE'].includes(error.code)) { retry = true; attemptTimer = setTimeout(attempt, 150); } else finish(error); });
        socket.on('data', chunk => {
          buffer += chunk; if (buffer.length > 2 * 1024 * 1024) { socket.destroy(); finish(new Error('Invalid administrator helper response.')); return; }
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            let message; try { message = JSON.parse(buffer.slice(0, end)); } catch { socket.destroy(); finish(new Error('Invalid administrator helper response.')); return; }
            buffer = buffer.slice(end + 1);
            try {
              if (!channel.established) { const reply = channel.handshake(message); if (reply) socket.write(JSON.stringify(reply) + '\n'); continue; }
              message = channel.open(message);
            } catch (error) { socket.destroy(); finish(error); return; }
            if (!ready) { if (message.event !== 'broker-ready') return finish(new Error('Invalid administrator helper response.')); ready = true; this.channel = channel; this.socket = socket; finish(); continue; }
            const pending = this.pending.get(message.id);
            if (pending && ['ready', 'error'].includes(message.event)) { clearTimeout(pending.timer); this.pending.delete(message.id); message.event === 'ready' ? pending.resolve() : pending.reject(new Error(message.data || 'Administrator shell failed.')); }
            this.onEvent(message);
          }
        });
        socket.on('close', () => {
          if (!ready && !retry) finish(new Error('Administrator helper disconnected before authentication.'));
          if (!ready || this.socket !== socket) return;
          this.socket = null;
          for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Administrator helper disconnected.')); }
          this.pending.clear(); this.onEvent({ event: 'broker-closed' });
        });
      };
      attempt();
    });
  }
}
module.exports = { PersistentAdminBroker };
