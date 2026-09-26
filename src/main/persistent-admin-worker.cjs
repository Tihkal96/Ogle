'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { AdminChannel } = require('./admin-channel.cjs');
const { startPty, options } = require('./terminal-manager.cjs');
const { validateConfig } = require('./persistent-admin.cjs');

// One connection owns its terminals. Disconnecting closes those terminals but
// leaves this installed helper available for the next Ogle process.
function serveConnection(socket, token, createPty = startPty) {
  let authenticated = false, buffer = '';
  const channel = new AdminChannel('server', token);
  const sessions = new Map();
  const send = message => { if (!socket.destroyed) socket.write(JSON.stringify(channel.seal(message)) + '\n'); };
  socket.setEncoding('utf8'); socket.setTimeout(5000, () => socket.destroy());
  socket.on('error', () => {});
  socket.on('close', () => { for (const pty of sessions.values()) { try { pty.kill(); } catch {} } sessions.clear(); });
  socket.on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 2 * 1024 * 1024) return socket.destroy();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let message;
      try {
        message = JSON.parse(line);
        if (!authenticated) {
          const reply = channel.handshake(message);
          if (reply) socket.write(JSON.stringify(reply) + '\n');
          if (channel.established) { authenticated = true; socket.setTimeout(0); send({ event: 'broker-ready' }); }
          continue;
        }
        try { message = channel.open(message); } catch { return socket.destroy(); }
        if (typeof message.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.id)) throw new Error('Invalid terminal identity.');
        const id = message.id;
        if (message.event === 'start' && !sessions.has(id)) {
          if (sessions.size >= 16) throw new Error('Maximum of 16 administrator terminals reached.');
          const pty = createPty(options(message.config)); sessions.set(id, pty);
          pty.onData(data => send({ event: 'data', id, data }));
          pty.onExit(event => { sessions.delete(id); send({ event: 'exit', id, ...event }); });
          send({ event: 'ready', id });
        } else if (message.event === 'write' && typeof message.data === 'string' && message.data.length <= 1024 * 1024) sessions.get(id)?.write(message.data);
        else if (message.event === 'resize' && Number.isInteger(message.cols) && Number.isInteger(message.rows)) sessions.get(id)?.resize(Math.max(2, Math.min(500, message.cols)), Math.max(2, Math.min(500, message.rows)));
        else if (message.event === 'close') sessions.get(id)?.kill();
      } catch (error) { if (!authenticated) return socket.destroy(); send({ event: 'error', id: message?.id, data: error.message }); }
    }
  });
}
function runPersistentWorker() {
  // This path is deliberately fixed next to the protected installed executable.
  // No command-line paths or environment-supplied worker configuration are read.
  const config = JSON.parse(fs.readFileSync(path.join(path.dirname(process.execPath), 'admin-helper.json'), 'utf8').replace(/^\uFEFF/, ''));
  validateConfig(config, config.sid);
  const server = net.createServer(socket => serveConnection(socket, config.token));
  server.maxConnections = 4;
  server.on('error', () => process.exit(1));
  server.listen(config.pipe);
}
module.exports = { runPersistentWorker, serveConnection };
