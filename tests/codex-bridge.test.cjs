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

test('UI history omits reasoning and tool payloads while preserving all visible messages', () => {
  const turns = Array.from({length: 250}, (_, i) => ({turnId: String(i), status: 'completed', items: [
    {id: `u${i}`, type: 'userMessage', content: [{type:'text', text:'question'}, {type:'image',url:'large'}]},
    {id: `r${i}`, type: 'reasoning', text:'private thinking'},
    {id: `t${i}`, type: 'commandExecution', aggregatedOutput:'large output'},
    {id: `a${i}`, type: 'agentMessage', text:'answer'}
  ]}));
  const projected = desktopThread({id:'t', turns});
  assert.equal(projected.thread.turns.length, 250);
  assert.deepEqual(projected.thread.turns[0].items.map(i=>i.type), ['userMessage','agentMessage']);
  assert.equal(projected.thread.turns[0].items[0].text, 'question\n[Image]');
  assert.equal(JSON.stringify(projected).includes('private thinking'), false);
});

test('stream burst coalesces answer deltas, ignores thinking and preserves completion ordering', async () => {
  const {bridge,children}=fixture(); await bridge.connect(); const events=[];
  bridge.on('notification', e=>events.push(e));
  for(let i=0;i<1000;i++) {
    children[0].reply({method:'item/reasoning/textDelta',params:{delta:'thinking'}});
    children[0].reply({method:'item/commandExecution/outputDelta',params:{delta:'output'}});
    children[0].reply({method:'item/agentMessage/delta',params:{threadId:'t',itemId:'a',delta:'x'}});
  }
  assert.equal(events.length,0);
  children[0].reply({method:'turn/completed',params:{threadId:'t',turn:{id:'turn',status:'completed'}}});
  assert.deepEqual(events.map(e=>e.method),['item/agentMessage/delta','turn/completed']);
  assert.equal(events[0].params.delta.length,1000);
  bridge.close();
});

test('desktop thinking patches update transport revision without repeated UI snapshots', async () => {
  const desktop = new DesktopIpc(), events=[]; desktop.followed.add('t'); desktop.on('state',e=>events.push(e));
  const deliver=change=>desktop._receive({type:'broadcast',method:'thread-stream-state-changed',version:11,params:{hostId:'local',conversationId:'t',change}});
  deliver({type:'snapshot',revision:1,conversationState:{id:'t',threadRuntimeStatus:{type:'active'},turns:[{turnId:'turn',status:'inProgress',items:[{id:'r',type:'reasoning',text:''},{id:'a',type:'agentMessage',text:''}]}]}});
  await new Promise(r=>setTimeout(r,150)); assert.equal(events.length,1);
  for(let revision=2;revision<=1001;revision++) deliver({type:'patches',baseRevision:revision-1,revision,patches:[{op:'replace',path:['turns',0,'items',0,'text'],value:'thinking '+revision}]});
  await new Promise(r=>setTimeout(r,150)); assert.equal(events.length,1); assert.equal(desktop.states.get('t').revision,1001);
  deliver({type:'patches',baseRevision:1001,revision:1002,patches:[{op:'replace',path:['turns',0,'items',1,'text'],value:'final answer'},{op:'replace',path:['threadRuntimeStatus'],value:{type:'idle'}}]});
  await new Promise(r=>setTimeout(r,150)); assert.equal(events.length,2); assert.equal(events[1].runtime.running,false); assert.equal(events[1].thread.turns[0].items[0].text,'final answer'); desktop.close();
});

test('desktop steer uses the owning writer and does not start or interrupt a turn', async () => {
  const { bridge, sent } = fixture();
  const desktop = new EventEmitter(); desktop.owners = new Map(); desktop.connect = async () => {}; desktop.owner = async () => 'owner'; desktop.close = () => {};
  const calls = []; desktop.steer = async (...args) => { calls.push(args); return { turnId: 'active' }; }; bridge.desktop = desktop;
  assert.deepEqual(await bridge.steerTurn('owned', 'adjust this', [imageInput], 'active'), { turnId: 'active' });
  assert.deepEqual(calls, [['owned', 'adjust this', 'owner', [imageInput]]]);
  assert.equal(sent.some(m => ['thread/resume','turn/start','turn/interrupt','turn/steer'].includes(m.method)), false);
  desktop.steer = async () => { throw new Error('Outcome unknown'); };
  await assert.rejects(bridge.steerTurn('owned', 'adjust again'), /Outcome unknown/);
  assert.equal(sent.some(m => m.method === 'turn/steer'), false); bridge.close();
});

test('shared steer guards the active turn ID without taking ownership', async () => {
  const { bridge, sent } = fixture((message, child) => { if (message.id) child.reply({ id: message.id, result: { turnId: 'active' } }); });
  for (const marker of [undefined, 'desktop', 'pending']) await assert.rejects(bridge.steerTurn('task', 'adjust', [], marker), /active turn is not available/);
  assert.deepEqual(await bridge.steerTurn('task', 'adjust', [], 'active'), { turnId: 'active' });
  const calls = sent.filter(m => m.method !== 'initialize' && m.method !== 'initialized');
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'turn/steer');
  assert.equal(calls[0].params.expectedTurnId, 'active'); assert.equal(calls[0].params.input[0].text, 'adjust'); bridge.close();
});

test('desktop steer sends supported follower payload and valid restore context', async () => {
  const ipc = new DesktopIpc(), calls = []; ipc.states.set('task', { state: { cwd: 'C:/work' } });
  ipc.follow = (id, owner) => calls.push(['follow', id, owner]);
  ipc.request = async (...args) => { calls.push(args); return { result: { result: { turnId: 'active' } } }; };
  assert.deepEqual(await ipc.steer('task', 'change direction', 'owner', [imageInput]), { turnId: 'active' });
  const [method, params, owner] = calls[1]; assert.equal(method, 'thread-follower-steer-turn'); assert.equal(owner, 'owner');
  assert.equal(params.input[0].text, 'change direction'); assert.deepEqual(params.input[1], imageInput);
  assert.equal(params.restoreMessage.id, params.clientUserMessageId); assert.equal(params.restoreMessage.context.prompt, 'change direction');
  assert.deepEqual(params.restoreMessage.context.workspaceRoots, ['C:/work']);
  // Exercise the real request envelope to guard the private protocol version.
  const envelopes = []; ipc._write = m => { envelopes.push(m); queueMicrotask(() => ipc._receive({ type:'response', requestId:m.requestId, resultType:'success', result:{} })); };
  await DesktopIpc.prototype.request.call(ipc, method, params, owner);
  assert.equal(envelopes[0].version, 1); ipc.close();
});

test('unsupported shared history uses read-only stdio once and keeps normal tasks on shared transport', async () => {
  const calls = [];
  const { bridge, children } = fixture((message, child, args) => {
    if (message.method !== 'thread/read') return;
    const shared = args.includes('proxy'); calls.push({ shared, method: message.method, id: message.params.threadId });
    if (shared && message.params.threadId === 'legacy') child.reply({ id: message.id, error: { message: 'list_turns is not supported yet' } });
    else child.reply({ id: message.id, result: { thread: { id: message.params.threadId, status: { type: 'idle' }, turns: [{ id: 'turn', status: 'completed', items: [{ type: 'agentMessage', text: 'visible answer' }, { type: 'reasoning', text: 'hidden' }] }] } } });
  });
  for (let i = 0; i < 2; i++) {
    const result = await bridge.readThread('legacy');
    assert.equal(result.thread.turns[0].items[0].text, 'visible answer');
    assert.equal(result.thread.turns[0].items.length, 1);
  }
  await bridge.readThread('normal');
  assert.deepEqual(calls.map(c => [c.shared, c.id]), [[true,'legacy'],[false,'legacy'],[false,'legacy'],[true,'normal']]);
  assert.equal(children.length, 2);
  const reader = bridge.historyReader; bridge.close(); assert.equal(reader.connected, false); assert.equal(bridge.unsupportedHistory.size, 0);
});

test('history fallback does not swallow permission errors or recurse on unsupported stdio', async () => {
  const { bridge, children } = fixture((message, child) => {
    if (message.method === 'thread/read') child.reply({ id: message.id, error: { message: message.params.threadId === 'denied' ? 'Permission denied' : 'list_turns is not supported yet' } });
  });
  await assert.rejects(bridge.readThread('denied'), /Permission denied/); assert.equal(children.length, 1);
  await assert.rejects(bridge.readThread('legacy'), /list_turns/); assert.equal(children.length, 2);
  bridge.close();
});

test('thread list removes repeated IDs without merging separate same-title tasks', async () => {
  const { bridge } = fixture((message, child) => {
    if (message.method === 'thread/list') child.reply({ id: message.id, result: { data: [{ id: 'a', name: 'Same' }, { id: 'a', name: 'Same' }, { id: 'b', name: 'Same' }], nextCursor: 'page2' } });
  });
  try { const result = await bridge.listThreads(); assert.deepEqual(result.data.map(t => t.id), ['a', 'b']); assert.equal(result.nextCursor, 'page2'); } finally { bridge.close(); }
});

test('Codex server exit leaves bridge reusable for another connection', async () => {
  const { bridge, children } = fixture((message, child) => {
    if (message.method === 'thread/list') child.reply({ id: message.id, result: { data: [] } });
  });
  try {
    await bridge.connect(); children[0].emit('exit', 0);
    assert.equal(bridge.connected, false);
    assert.deepEqual(await bridge.listThreads(), { data: [] });
    assert.equal(children.length, 2);
  } finally { bridge.close(); }
});

test('model catalog follows pages and new turns carry chosen model and effort', async () => {
  const {bridge, sent} = fixture((message, child) => {
    if (message.method === 'model/list') child.reply({id:message.id,result:message.params.cursor ? {data:[{model:'beta',hidden:false}],nextCursor:null} : {data:[{model:'alpha',hidden:false},{model:'hidden',hidden:true}],nextCursor:'page2'}});
    else if (message.id) child.reply({id:message.id,result:{turn:{id:'turn'}}});
  });
  assert.deepEqual((await bridge.listModels()).data.map(row=>row.model), ['alpha','beta']);
  await bridge.sendTurn('task','Hello',[],{model:'alpha',effort:'high'});
  const request=sent.find(row=>row.method==='turn/start');
  assert.equal(request.params.model,'alpha');assert.equal(request.params.effort,'high');
  await assert.rejects(bridge.sendTurn('task','Hello',[],{model:{name:'alpha'}}), /Invalid Codex model/);
  bridge.close();
});

test('desktop model overrides preserve collaboration mode and permissions inheritance', async () => {
  const desktop=new DesktopIpc(); let request;
  desktop.states.set('task',{state:{latestCollaborationMode:{mode:'plan',settings:{model:'old',reasoning_effort:'low',developer_instructions:'Keep plan instructions'}}}});
  desktop.follow=()=>{};
  desktop.request=async (_method,params)=>{request=params;return {result:{result:{turn:{id:'new'}}}};};
  await desktop.send('task','Hello','owner',[],{model:'new-model',effort:'high'});
  assert.equal(request.turnStart.context.inheritThreadSettings,true);
  assert.deepEqual(request.turnStart.request.collaborationMode,{mode:'plan',settings:{model:'new-model',reasoning_effort:'high',developer_instructions:'Keep plan instructions'}});
  assert.equal(request.turnStart.request.approvalPolicy,undefined);
  desktop.close();
});
