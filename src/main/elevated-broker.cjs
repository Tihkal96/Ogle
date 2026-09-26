'use strict';
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

// One consented helper per dock lifetime; closing a shell keeps the helper alive.
class ElevatedBroker {
  constructor({ executable, workerArgs = [], onEvent = () => {}, launch } = {}) {
    Object.assign(this, { executable, workerArgs, onEvent, launch });
    this.socket = null; this.server = null; this.connecting = null; this.pending = new Map();
  }
  async connect() {
    if (this.socket && !this.socket.destroyed) return;
    if (!this.connecting) this.connecting = this._connect().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  _connect() {
    const token = crypto.randomBytes(32).toString('hex'), pipe = `\\\\.\\pipe\\petdock-${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      let finished = false;
      const timer = setTimeout(() => finish(new Error('Administrator approval was cancelled or the helper did not connect.')), 60000);
      const finish = error => {
        if (finished) return; finished = true; clearTimeout(timer); this.cancelConnect = null;
        if (error) { this.socket?.destroy(); this.socket = null; this.server?.close(); this.server = null; reject(error); }
        else { this.onEvent({ event: 'broker-ready' }); resolve(); }
      };
      this.cancelConnect = () => finish(new Error('Administrator helper cancelled.'));
      this.server = net.createServer(socket => {
        let authenticated = false, buffer = '';
        socket.setEncoding('utf8'); socket.setTimeout(5000, () => socket.destroy()); socket.on('error', () => {});
        socket.on('data', chunk => {
          buffer += chunk; if (buffer.length > 2*1024*1024) return socket.destroy();
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0,end); buffer = buffer.slice(end+1);
            let message; try { message = JSON.parse(line); } catch { socket.destroy(); return; }
            if (!authenticated) {
              if (message.token !== token || this.socket) { socket.destroy(); return; }
              authenticated = true; this.socket = socket; socket.setTimeout(0); finish();
            } else {
              const pending = this.pending.get(message.id);
              if (pending && ['ready','error'].includes(message.event)) {
                clearTimeout(pending.timer); this.pending.delete(message.id);
                message.event === 'ready' ? pending.resolve() : pending.reject(new Error(message.data || 'Administrator shell failed'));
              }
              this.onEvent(message);
            }
          }
        });
        socket.on('close', () => {
          if (!authenticated || this.socket !== socket) return;
          this.socket = null; this.server?.close(); this.server = null;
          for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Administrator helper disconnected')); }
          this.pending.clear(); this.onEvent({ event: 'broker-closed' });
        });
      });
      this.server.on('error', finish);
      this.server.listen(pipe, () => {
        try {
          const args = [...this.workerArgs, '--terminal-worker', pipe, token];
          if (this.launch) this.launch(this.executable, args).catch(finish);
          else {
            const quote = value => "'" + value.replace(/'/g, "''") + "'";
            const argumentLine = args.map(value => '"' + value.replace(/"/g, '\\"') + '"').join(' ');
            const command = `Start-Process -FilePath ${quote(this.executable)} -ArgumentList ${quote(argumentLine)} -Verb RunAs -WindowStyle Hidden -ErrorAction Stop`;
            const child = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')], { windowsHide: true, stdio: 'ignore' });
            child.on('error',finish); child.on('exit',code => { if (code) finish(new Error('Administrator launch was cancelled or failed.')); });
          }
        } catch (error) { finish(error); }
      });
    });
  }
  async create(id, config) {
    await this.connect();
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); try { this.send({ event:'close', id }); } catch {} reject(new Error('Administrator shell startup timed out.')); },20000);
      this.pending.set(id,{resolve,reject,timer});
      try { this.send({ event:'start', id, config }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  send(message) { if (!this.socket || this.socket.destroyed) throw new Error('Administrator helper is disconnected'); this.socket.write(JSON.stringify(message)+'\n'); }
  dispose() {
    this.cancelConnect?.();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Administrator helper released')); }
    this.pending.clear(); this.socket?.destroy(); this.server?.close(); this.socket = null; this.server = null;
  }
}
module.exports = { ElevatedBroker };
