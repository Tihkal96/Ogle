'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { CodexBridge } = require('../src/main/codex-bridge.cjs');
const { DesktopIpc, applyDesktopPatches, desktopThread } = require('../src/main/codex-bridge.cjs');
const { promptInputs } = require('../src/main/codex-bridge.cjs');
const imageInput = { type: 'image', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2s2sAAAAASUVORK5CYII=' };
function fixture(handler = () => {}) {
  const sent = [], children = [];
  const spawnProcess = (_exe, args) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.reply = value => child.stdout.write(JSON.stringify(value) + '\n');
    child.stdin = new Writable({ write(chunk, _encoding, callback) {
      const message = JSON.parse(chunk.toString()); sent.push(message);
      if (message.method === 'initialize') queueMicrotask(() => child.reply({ id: message.id, result: {} }));
      else handler(message, child, args);
      callback();
    } });
    child.kill = () => {}; children.push(child); return child;
  };
  return { bridge: new CodexBridge({ spawnProcess, timeoutMs: 80 }), sent, children };
}
test('multiplexes out-of-order responses and fragmented notifications', async () => {
  const calls = [];
  const { bridge, children } = fixture((message, child) => { if (message.id) calls.push([message, child]); });
  await bridge.connect();
  const a = bridge.listThreads({ searchTerm: 'alpha' }), b = bridge.readThread('beta');
  await new Promise(resolve => setImmediate(resolve));
  calls[1][1].reply({ id: calls[1][0].id, result: { thread: { id: 'beta' } } });
  calls[0][1].reply({ id: calls[0][0].id, result: { data: [] } });
  assert.deepEqual(await a, { data: [] }); assert.equal((await b).thread.id, 'beta');
  const event = new Promise(resolve => bridge.once('notification', resolve));
  children[0].stdout.write('{"method":"turn/com'); children[0].stdout.write('pleted","params":{}}\n');
  assert.equal((await event).method, 'turn/completed'); bridge.close();
});
test('approval requests are never automatically answered', async () => {
  const { bridge, sent, children } = fixture(); await bridge.connect();
  const approval = new Promise(resolve => bridge.once('request', resolve));
  children[0].reply({ id: 'approval1', method: 'item/commandExecution/requestApproval', params: {} });
  assert.equal((await approval).id, 'approval1');
  assert.equal(sent.some(message => message.id === 'approval1'), false);
  bridge.respond('approval1', { decision: 'decline' });
  assert.deepEqual(sent.at(-1), { id: 'approval1', result: { decision: 'decline' } });
  assert.throws(() => bridge.respond('approval1', {}), /no longer pending/); bridge.close();
});
test('server errors and disconnection reject pending calls', async () => {
  const { bridge, children } = fixture((message, child) => {
    if (message.method === 'thread/read') child.reply({ id: message.id, error: { code: -32602, message: 'No such task' } });
  });
  await bridge.connect(); await assert.rejects(bridge.readThread('missing'), /No such task/);
  const list = bridge.listThreads(); await new Promise(resolve => setImmediate(resolve));
  children[0].emit('exit', 1); await assert.rejects(list, /connection closed/); assert.equal(bridge.pending.size, 0);
});
test('timeouts clean pending requests without claiming operation cancellation', async () => {
  const { bridge } = fixture(); await bridge.connect();
  await assert.rejects(bridge.listThreads(), /may still be running/); assert.equal(bridge.pending.size, 0); bridge.close();
});
test('concurrent sends share one resume and use safe approval settings', async () => {
  const { bridge, sent } = fixture((message, child) => {
    if (message.id) setImmediate(() => child.reply({ id: message.id, result: { turn: { id: String(message.id) } } }));
  });
  await Promise.all([bridge.sendTurn('thread', 'one'), bridge.sendTurn('thread', 'two')]);
  assert.equal(sent.filter(message => message.method === 'initialize').length, 1);
  assert.equal(sent.filter(message => message.method === 'thread/resume').length, 1);
  for (const turn of sent.filter(message => message.method === 'turn/start')) assert.equal(turn.params.approvalPolicy, 'on-request');
  bridge.close();
});
test('unavailable shared proxy falls back to stdio and identifies the limitation', async () => {
  const attempts = [], statuses = [];
  const base = fixture();
  const original = base.bridge.spawnProcess;
  base.bridge.spawnProcess = (exe, args, options) => {
    attempts.push(args);
    if (!args.includes('proxy')) return original(exe, args, options);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {};
    setImmediate(() => child.emit('exit', 1)); return child;
  };
  base.bridge.on('status', status => statuses.push(status));
  assert.deepEqual(await base.bridge.connect(), { mode: 'standalone' });
  assert.equal(attempts.length, 2);
  assert.match(statuses.at(-1).detail, /separate server/);
  assert.match(statuses.at(-1).detail, /Do not send/);
  base.bridge.close();
});
test('history keeps server runtime status distinct from unfinished historical turns', async () => {
  const { bridge } = fixture((message, child) => {
    if (message.method === 'thread/read') child.reply({ id: message.id, result: { thread: {
      id: 'old-thread', status: { type: 'notLoaded' }, turns: [{ id: 'old-turn', status: 'inProgress' }]
    } } });
  });
  const { thread } = await bridge.readThread('old-thread');
  assert.deepEqual(thread.status, { type: 'notLoaded' });
  assert.equal(thread.turns[0].status, 'inProgress');
  bridge.close();
});
test('desktop-owned send bypasses standalone writer resume and never retries rejected submission', async () => {
  const { bridge, sent } = fixture();
  const desktop = new EventEmitter(); desktop.owners = new Map(); desktop.connect = async () => {}; desktop.owner = async () => 'desktop-owner'; desktop.close = () => {};
  let sends = 0; desktop.send = async () => { sends++; throw new Error('Outcome unknown'); };
  bridge.desktop = desktop;
  await assert.rejects(bridge.sendTurn('owned', 'hello'), /Outcome unknown/);
  assert.equal(sends, 1); assert.equal(sent.some(message => ['thread/resume', 'turn/start'].includes(message.method)), false);
  bridge.close();
});
test('canonical desktop history normalizes turns and authoritative approval flags', () => {
  const result = desktopThread({ id: 't', threadRuntimeStatus: { type: 'active', activeFlags: ['waitingOnApproval'] }, turns: [], requests: [], turnHistory: { kind: 'canonical', history: { entitiesByKey: { a: { turnId: 'real-turn', status: 'inProgress', items: [] } }, islands: [{ entries: [{ value: 'a' }] }] } } });
  assert.equal(result.thread.turns[0].id, 'real-turn'); assert.equal(result.runtime.running, true); assert.equal(result.runtime.waitingForApproval, true); assert.equal(result.runtime.turnId, 'real-turn');
});
test('desktop patches support arrays and reject prototype pollution', () => {
  const state = applyDesktopPatches({ items: [{ text: '' }] }, [{ op: 'replace', path: ['items', 0, 'text'], value: 'live' }, { op: 'add', path: ['items', 1], value: 'end' }]);
  assert.deepEqual(state.items, [{ text: 'live' }, 'end']);
  assert.throws(() => applyDesktopPatches(state, [{ op: 'add', path: ['__proto__', 'polluted'], value: true }]), /Unsupported/);
  assert.equal({}.polluted, undefined);
});
test('desktop transport frames requests, handles fragmented state and targets owning client', async () => {
  const messages = [], socket = new EventEmitter(); socket.destroyed = false;
  socket.destroy = () => { socket.destroyed = true; socket.emit('close'); };
  const deliver = message => { const body = Buffer.from(JSON.stringify(message)), header = Buffer.alloc(4); header.writeUInt32LE(body.length); const frame = Buffer.concat([header, body]); socket.emit('data', frame.subarray(0, 3)); socket.emit('data', frame.subarray(3)); };
  socket.write = frame => {
    const message = JSON.parse(frame.subarray(4)); messages.push(message);
    if (message.type !== 'request') return;
    queueMicrotask(() => deliver({ type: 'response', requestId: message.requestId, method: message.method, resultType: 'success', handledByClientId: 'desktop-owner', result: message.method === 'initialize' ? { clientId: 'petdock-client' } : message.method === 'thread-follower-start-turn' ? { result: { turn: { id: 'turn1' } } } : {} }));
  };
  const desktop = new DesktopIpc({ connectSocket: () => { queueMicrotask(() => socket.emit('connect')); return socket; } });
  const owner = await desktop.owner('thread1'); assert.equal(owner, 'desktop-owner');
  assert.deepEqual(await desktop.send('thread1', 'hello', owner), { turn: { id: 'turn1' } });
  const sent = messages.find(message => message.method === 'thread-follower-start-turn'); assert.equal(sent.version, 2); assert.equal(sent.targetClientId, owner); assert.equal(sent.params.turnStart.request.input[0].text, 'hello');
  await desktop.send('thread1', 'Describe this image', owner, [imageInput]);
  const imageRequest = messages.filter(message => message.method === 'thread-follower-start-turn').at(-1);
  assert.deepEqual(imageRequest.params.turnStart.request.input, [{ type: 'text', text: 'Describe this image', text_elements: [] }, imageInput]);
  const state = new Promise(resolve => desktop.once('state', resolve));
  deliver({ type: 'broadcast', method: 'thread-stream-state-changed', version: 11, params: { hostId: 'local', conversationId: 'thread1', change: { type: 'snapshot', revision: 1, conversationState: { id: 'thread1', turns: [], threadRuntimeStatus: { type: 'idle' } } } } });
  assert.equal((await state).runtime.running, false); desktop.close();
});
test('account methods dispatch only explicit protocol requests', async () => {
  const { bridge, sent } = fixture((message, child) => { if (message.id) child.reply({ id: message.id, result: {} }); });
  await bridge.accountRead(); await bridge.login(); await bridge.logout();
  assert.deepEqual(sent.filter(message => message.method.startsWith('account/')).map(message => [message.method, message.params]), [['account/read', { refreshToken: false }], ['account/login/start', { type: 'chatgpt' }], ['account/logout', {}]]);
  bridge.close();
});
test('standalone image-only prompt transmits actual image data using the native url field', async () => {
  const { bridge, sent } = fixture((message, child) => { if (message.id) child.reply({ id: message.id, result: { turn: { id: 'image-turn' } } }); });
  await bridge.sendTurn('thread-image', '', [imageInput]);
  const turn = sent.find(message => message.method === 'turn/start');
  assert.deepEqual(turn.params.input, [imageInput]);
  assert.equal(Object.hasOwn(turn.params.input[0], 'imageUrl'), false);
  bridge.close();
});
test('image inputs validate types, decoding, count and pixel limits before connecting', async () => {
  assert.deepEqual(promptInputs('text'), [{ type: 'text', text: 'text', text_elements: [] }]);
  assert.throws(() => promptInputs('', []), /prompt or attach/);
  assert.throws(() => promptInputs('', Array(5).fill(imageInput)), /up to 4/);
  assert.throws(() => promptInputs('', [{ type: 'image', url: 'https://example.com/image.png' }]), /Paste a PNG/);
  assert.throws(() => promptInputs('', [{ type: 'image', url: 'data:image/png;base64,YWJj' }]), /not a readable image/);
  assert.throws(() => promptInputs('', [{ ...imageInput, url: imageInput.url.replace('image/png', 'image/jpeg') }]), /does not match/);
  const oversized = Buffer.from(imageInput.url.split(',')[1], 'base64'); oversized.writeUInt32BE(20000, 16);
  assert.throws(() => promptInputs('', [{ type: 'image', url: 'data:image/png;base64,' + oversized.toString('base64') }]), /dimensions/);
  const { bridge, sent } = fixture(); await assert.rejects(bridge.sendTurn('thread', '', [{ type: 'localImage', path: 'C:/secret.png' }]), /Invalid image/); assert.equal(sent.length, 0);
});
