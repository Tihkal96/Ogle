'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TerminalManager, options } = require('../src/main/terminal-manager.cjs');
async function bounded(promise) { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Terminal output timed out')), 10000); })]); } finally { clearTimeout(timer); } }
test('validates shell and bounds dimensions', () => { assert.throws(() => options({ shell: 'cmd.exe & calc' })); assert.equal(options({ shell: 'cmd', cols: 9999 }).cols, 500); });

test('packaged standard accounts use consented session elevation instead of persistent installation', async () => {
  const { ElevatedBroker } = require('../src/main/elevated-broker.cjs');
  const { PersistentAdminBroker } = require('../src/main/persistent-admin-broker.cjs');
  for (const eligible of [false, true]) {
    let constructed = 0, created = 0;
    const manager = new TerminalManager({ packaged: true, brokerFactory(Broker) {
      assert.equal(Broker, eligible ? PersistentAdminBroker : ElevatedBroker);
      constructed++; return { async create() { created++; }, send() {}, dispose() {} };
    } });
    manager.installation = { async canPersist() { return eligible; } };
    try {
      await manager.create({ shell: 'powershell', admin: true });
      await manager.create({ shell: 'cmd', admin: true });
      assert.equal(constructed, 1); assert.equal(created, 2);
    } finally { manager.dispose(); }
  }
});

test('releasing administrator access during account lookup prevents late elevation', async () => {
  let finish;
  const manager = new TerminalManager({ brokerFactory() { throw new Error('Must not launch after cancellation'); } });
  manager.installation = { canPersist: () => new Promise(resolve => { finish = resolve; }) };
  const result = manager.create({ shell: 'cmd', admin: true });
  manager.releaseAdmin(); finish(false);
  await assert.rejects(result, /startup was cancelled/);
  assert.equal(manager.sessions.size, 0);
});
test('real CMD terminal runs a command and exits', { timeout: 20000, skip: process.platform !== 'win32' }, async () => {
  let output = '', resolveOutput;
  const received = new Promise(resolve => { resolveOutput = resolve; });
  const manager = new TerminalManager({ onEvent: event => { if (event.event === 'data') { output += event.data; if (output.includes('PETDOCK_TERMINAL_OK')) resolveOutput(); } } });
  try { const session = await manager.create({ shell: 'cmd', cwd: process.cwd() }); manager.resize(session.id, 100, 30); manager.write(session.id, 'echo PETDOCK_TERMINAL_OK\r'); await bounded(received); assert.match(output, /PETDOCK_TERMINAL_OK/); } finally { manager.dispose(); }
});
test('real PowerShell executes and emits computed output', { timeout: 20000, skip: process.platform !== 'win32' }, async () => {
  let output = '', resolveOutput;
  const received = new Promise(resolve => { resolveOutput = resolve; });
  const manager = new TerminalManager({ onEvent: event => { if (event.event === 'data') { output += event.data; if (output.includes('PETDOCK_PS_42')) resolveOutput(); } } });
  try { const session = await manager.create({ shell: 'powershell', cwd: process.cwd() }); manager.write(session.id, 'Write-Output (\'PETDOCK_PS_\' + (6*7))\r'); await bounded(received); assert.match(output, /PETDOCK_PS_42/); } finally { manager.dispose(); }
});
test('worker authenticates and exchanges terminal output over named pipe without elevation', { timeout: 20000, skip: process.platform !== 'win32' }, async () => {
  const net = require('node:net'), crypto = require('node:crypto'), { spawn } = require('node:child_process');
  const pipe = `\\\\.\\pipe\\petdock-${crypto.randomUUID()}`, token = crypto.randomBytes(32).toString('hex');
  let client, worker, resolveOutput, authenticated = false;
  const output = new Promise(resolve => { resolveOutput = resolve; });
  const server = net.createServer(socket => {
    client = socket; let buffer = '', text = ''; socket.setEncoding('utf8');
    socket.on('data', chunk => { buffer += chunk; let end; while ((end = buffer.indexOf('\n')) >= 0) { const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      if (message.token) { assert.equal(message.token, token); authenticated = true; socket.write(JSON.stringify({ event: 'start', config: { shell: 'cmd', cwd: process.cwd() } }) + '\n'); }
      if (message.event === 'ready') socket.write(JSON.stringify({ event: 'write', data: 'echo PETDOCK_WORKER_OK\r' }) + '\n');
      if (message.event === 'data') { text += message.data; if (text.includes('PETDOCK_WORKER_OK')) resolveOutput(); }
    } });
  });
  try {
    await new Promise(resolve => server.listen(pipe, resolve));
    worker = spawn(process.execPath, ['-e', 'require("./src/main/terminal-worker.cjs").runWorker()', '--', '--terminal-worker', pipe, token], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore' });
    await bounded(output); assert.equal(authenticated, true);
  } finally { client?.destroy(); server.close(); worker?.kill(); }
});
