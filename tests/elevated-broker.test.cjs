'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { ElevatedBroker } = require('../src/main/elevated-broker.cjs');

function fakeHelper({ autoReady = true } = {}) {
  const sockets = [], received = [], events = [];
  let launches = 0;
  const broker = new ElevatedBroker({ executable: 'not-launched.exe', onEvent: event => events.push(event), launch: async (_exe, args) => {
    launches++;
    const socket = net.connect(args.at(-2)); sockets.push(socket);
    let buffer = '';
    socket.setEncoding('utf8'); socket.on('error', () => {});
    socket.on('connect', () => socket.write(JSON.stringify({ token: args.at(-1) }) + '\n'));
    socket.on('data', chunk => {
      buffer += chunk; let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); received.push(message);
        if (message.event === 'start' && autoReady) socket.write(JSON.stringify({ event: 'ready', id: message.id }) + '\n');
      }
    });
  } });
  return { broker, received, events, sockets, launches: () => launches, cleanup() { broker.dispose(); for (const socket of sockets) socket.destroy(); } };
}

test('one authenticated helper is reused across CMD and PowerShell sessions', { skip: process.platform !== 'win32', timeout: 5000 }, async () => {
  const fixture = fakeHelper();
  try {
    await Promise.all([fixture.broker.create('cmd1', { shell: 'cmd' }), fixture.broker.create('ps1', { shell: 'powershell' })]);
    assert.equal(fixture.launches(), 1);
    assert.deepEqual(fixture.received.filter(message => message.event === 'start').map(message => message.config.shell).sort(), ['cmd', 'powershell']);
    fixture.broker.send({ event: 'close', id: 'cmd1' });
    await fixture.broker.create('cmd2', { shell: 'cmd' });
    assert.equal(fixture.launches(), 1);
    assert.equal(fixture.events.filter(event => event.event === 'broker-ready').length, 1);
    assert.equal(fixture.broker.pending.size, 0);
  } finally { fixture.cleanup(); }
});

test('dispose rejects shell startup and closes the privileged helper connection', { skip: process.platform !== 'win32', timeout: 5000 }, async () => {
  const fixture = fakeHelper({ autoReady: false });
  try {
    await fixture.broker.connect();
    const creating = fixture.broker.create('pending', { shell: 'cmd' });
    const rejected = assert.rejects(creating, /released/);
    await new Promise(resolve => setImmediate(resolve));
    fixture.broker.dispose(); await rejected;
    assert.equal(fixture.broker.socket, null); assert.equal(fixture.broker.server, null); assert.equal(fixture.broker.pending.size, 0);
    assert.throws(() => fixture.broker.send({ event: 'write', id: 'pending', data: 'x' }), /disconnected/);
  } finally { fixture.cleanup(); }
});

test('cancelled launch rejects without leaving a server or pending connection', { skip: process.platform !== 'win32', timeout: 5000 }, async () => {
  const broker = new ElevatedBroker({ launch: async () => { throw new Error('UAC cancelled'); } });
  try { await assert.rejects(broker.connect(), /UAC cancelled/); assert.equal(broker.server, null); assert.equal(broker.socket, null); assert.equal(broker.connecting, null); } finally { broker.dispose(); }
});

test('wrong authentication token cannot become the administrator helper', { skip: process.platform !== 'win32', timeout: 5000 }, async () => {
  let wrong, good;
  const broker = new ElevatedBroker({ launch: async (_exe, args) => {
    wrong = net.connect(args.at(-2)); wrong.on('error', () => {});
    await new Promise(resolve => { wrong.on('connect', () => wrong.write(JSON.stringify({ token: 'wrong-token' }) + '\n')); wrong.on('close', resolve); });
    assert.equal(broker.socket, null);
    good = net.connect(args.at(-2)); good.on('error', () => {}); good.on('connect', () => good.write(JSON.stringify({ token: args.at(-1) }) + '\n'));
  } });
  try { await broker.connect(); assert.equal(wrong.destroyed, true); assert.ok(broker.socket); } finally { broker.dispose(); wrong?.destroy(); good?.destroy(); }
});

test('disposing before pipe starts listening cannot launch an administrator helper', { skip: process.platform !== 'win32', timeout: 5000 }, async () => {
  let launches = 0;
  const broker = new ElevatedBroker({ launch: async () => { launches++; } });
  const connected = broker.connect();
  const rejected = assert.rejects(connected, /cancelled/);
  broker.dispose(); await rejected;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(launches, 0);
});
