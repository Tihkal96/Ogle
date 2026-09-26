'use strict';
const net = require('node:net');
const { startPty, options } = require('./terminal-manager.cjs');
function runWorker() {
  const index = process.argv.indexOf('--terminal-worker');
  const [pipe, token] = process.argv.slice(index + 1);
  if (index < 0 || !/^\\\\\.\\pipe\\petdock-[a-f0-9-]+$/.test(pipe || '') || !/^[a-f0-9]{64}$/.test(token || '')) process.exit(1);
  const sessions = new Map(); let buffer = '', shuttingDown = false, shutdownTimer, exitScheduled = false, shutdownCode = 0;
  const socket = net.connect(pipe);
  const send = message => { if (!socket.destroyed) socket.write(JSON.stringify(message) + '\n'); };
  const finishShutdown = () => {
    if (!shuttingDown || sessions.size || exitScheduled) return;
    exitScheduled = true; clearTimeout(shutdownTimer);
    // ConPTY exit listeners run within native callbacks. Leave that stack and
    // allow pending native cleanup to drain before ending the Electron worker.
    setTimeout(() => process.exit(shutdownCode), 100);
  };
  const shutdown = code => {
    if (shuttingDown) return;
    shuttingDown = true; shutdownCode = code;
    shutdownTimer = setTimeout(() => process.exit(shutdownCode || 1), 5000);
    for (const pty of sessions.values()) { try { pty.kill(); } catch { /* Bounded shutdown still guarantees the helper exits. */ } }
    finishShutdown();
  };
  socket.setEncoding('utf8');
  socket.on('connect', () => send({ token }));
  socket.on('error', () => shutdown(1));
  socket.on('close', () => shutdown(0));
  socket.on('data', chunk => {
    if (shuttingDown) return;
    buffer += chunk;
    if (buffer.length > 2 * 1024 * 1024) return socket.destroy();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let message;
      try {
        message = JSON.parse(line);
        const id = typeof message.id === 'string' ? message.id : 'legacy';
        if (message.event === 'start' && !sessions.has(id)) {
          if (sessions.size >= 16) throw new Error('Maximum of 16 administrator terminals reached');
          const pty = startPty(options(message.config)); sessions.set(id, pty);
          pty.onData(data => send({ event: 'data', id, data }));
          pty.onExit(event => { if (sessions.get(id) === pty) sessions.delete(id); send({ event: 'exit', id, ...event }); if (id === 'legacy') socket.end(); finishShutdown(); });
          send({ event: 'ready', id });
        } else if (message.event === 'write' && typeof message.data === 'string' && message.data.length <= 1024*1024) sessions.get(id)?.write(message.data);
        else if (message.event === 'resize' && Number.isInteger(message.cols) && Number.isInteger(message.rows)) sessions.get(id)?.resize(Math.max(2, Math.min(500, message.cols)), Math.max(2, Math.min(500, message.rows)));
        else if (message.event === 'close') sessions.get(id)?.kill();
      } catch (error) { send({ event: 'error', id: message?.id, data: error.message }); }
    }
  });
}
module.exports = { runWorker };
