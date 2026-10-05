'use strict';
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { imageSize } = require('image-size');
const { resolveCodexExecutable } = require('./codex-executable.cjs');
const { CodexActivity } = require('./codex-activity.cjs');
const { IpcFrames } = require('./ipc-frames.cjs');
const { CodexHistoryPages } = require('./codex-history-pages.cjs');
const { CodexRolloutPages } = require('./codex-rollout-pages.cjs');

function modelOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid Codex model options.');
  const result = {};
  for (const key of ['model', 'effort']) {
    if (options[key] == null || options[key] === '') continue;
    if (typeof options[key] !== 'string' || options[key].length > 160 || !/^[a-zA-Z0-9._:/-]+$/.test(options[key])) throw new Error('Invalid Codex ' + key + '.');
    result[key] = options[key];
  }
  return result;
}

const IMAGE_LIMITS = { count: 4, bytesEach: 8 * 1024 * 1024, bytesTotal: 16 * 1024 * 1024 };
function promptInputs(text, images = []) {
  if (typeof text !== 'string') throw new Error('Prompt text must be a string.');
  if (!Array.isArray(images) || images.length > IMAGE_LIMITS.count) throw new Error('Attach up to 4 images.');
  let total = 0;
  const imageInputs = images.map(image => {
    if (!image || image.type !== 'image' || typeof image.url !== 'string') throw new Error('Invalid image attachment.');
    if (image.url.length > Math.ceil(IMAGE_LIMITS.bytesEach / 3) * 4 + 64) throw new Error('Each image must be 8 MB or smaller.');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.url);
    if (!match || match[2].length % 4 !== 0) throw new Error('Paste a PNG, JPEG, or WebP image.');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.toString('base64') !== match[2]) throw new Error('Invalid image encoding.');
    total += bytes.length;
    if (bytes.length > IMAGE_LIMITS.bytesEach || total > IMAGE_LIMITS.bytesTotal) throw new Error('Images must total 16 MB or less, with at most 8 MB each.');
    let dimensions;
    try { dimensions = imageSize(bytes); } catch { throw new Error('The attachment is not a readable image.'); }
    if (dimensions.type !== (match[1] === 'jpeg' ? 'jpg' : match[1])) throw new Error('Image content does not match its file type.');
    if (!dimensions.width || !dimensions.height || dimensions.width > 16384 || dimensions.height > 16384 || dimensions.width * dimensions.height > 40e6) throw new Error('Image dimensions are too large (maximum 40 megapixels).');
    return { type: 'image', url: image.url };
  });
  if (!text.trim() && !imageInputs.length) throw new Error('Enter a prompt or attach an image first.');
  return [...(text.trim() ? [{ type: 'text', text, text_elements: [] }] : []), ...imageInputs];
}

// Desktop coordination protocol observed in Codex 26.924.2738.0. This is a
// versioned local IPC interface, not the public app-server stdio transport.
const IPC_VERSIONS = { 'thread-owner-discovery': 1, 'thread-follower-start-turn': 2, 'thread-follower-steer-turn': 1, 'thread-follower-interrupt-turn': 4, 'thread-stream-following-changed': 1 };
function applyDesktopPatches(state, patches) {
  for (const patch of patches) {
    if (!Array.isArray(patch.path) || patch.path.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Unsupported desktop state path');
    if (!['add', 'replace', 'remove'].includes(patch.op)) throw new Error('Unsupported desktop state operation');
    if (!patch.path.length) { if (patch.op !== 'replace') throw new Error('Unsupported root operation'); state = patch.value; continue; }
    let target = state;
    for (const key of patch.path.slice(0, -1)) { if (target == null || !Object.hasOwn(target, key)) throw new Error('Desktop state path unavailable'); target = target[key]; }
    const key = patch.path.at(-1);
    if (Array.isArray(target) && patch.op === 'remove') target.splice(Number(key), 1);
    else if (Array.isArray(target) && patch.op === 'add') target.splice(Number(key), 0, patch.value);
    else if (patch.op === 'remove') delete target[key];
    else target[key] = patch.value;
  }
  return state;
}
// Keep transport state intact for revision patches, but send only visible conversation
// content across Electron IPC. Tool output and reasoning can dwarf the messages.
function messageItem(item) {
  if (!['usermessage', 'agentmessage'].includes(item?.type?.toLowerCase())) return null;
  const text = typeof item.text === 'string' ? item.text : (Array.isArray(item.content) ? item.content : []).map(part => part.text || (part.type?.toLowerCase().includes('image') ? '[Image]' : '')).filter(Boolean).join('\n');
  return { id: item.id, type: item.type, text };
}
function messageTurn(turn) { return { id: turn.turnId || turn.id || turn.params?.clientUserMessageId || 'pending', status: turn.status, error: turn.error, items: (turn.items || []).map(messageItem).filter(Boolean) }; }
function conversationWindow(turns, limit = 80) {
  const visible = []; let count = 0, cut = false;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i], items = [];
    for (let j = (turn.items || []).length - 1; j >= 0; j--) {
      const item = turn.items[j];
      if (!['usermessage','agentmessage'].includes(item?.type?.toLowerCase())) continue;
      if (count >= limit) { cut = true; break; }
      items.unshift(messageItem(item)); count++;
    }
    if (items.length || i === turns.length - 1) visible.unshift({...messageTurn({...turn, items: []}), items});
    if (cut || count >= limit && i > 0) { cut ||= i > 0; break; }
  }
  return {turns: visible, history: {hasMore: cut, loadedMessages: count}};
}
function threadOptions(state) {
  const settings = state.latestThreadSettings || {}, collaboration = settings.collaborationMode || state.latestCollaborationMode;
  const model = settings.model || state.latestModel || collaboration?.settings?.model || state.model;
  const effort = settings.effort || state.latestReasoningEffort || collaboration?.settings?.reasoning_effort || state.effort;
  return {...(typeof model === 'string' ? {model} : {}), ...(typeof effort === 'string' ? {effort} : {})};
}
function projectThread(thread, limit = 80) { return {id:thread.id,name:thread.name,cwd:thread.cwd,status:thread.status,...threadOptions(thread),...conversationWindow(thread.turns || [],limit)}; }
function patchChangesMessages(state, patch) {
  const index = patch.path.indexOf('items');
  if (index < 0 || patch.path.length <= index + 2 || patch.op === 'remove') return true;
  let item = state;
  for (const key of patch.path.slice(0, index + 2)) item = item?.[key];
  return ['usermessage', 'agentmessage'].includes(item?.type?.toLowerCase());
}
function desktopThread(state, limit = 80) {
  const history = state.turnHistory?.kind === 'canonical' ? state.turnHistory.history : null;
  let turns = state.turns || [];
  if (history) {
    const keys = history.islands?.flatMap(island => island.entries?.map(entry => entry.value) || []) || [];
    turns = (keys.length ? keys.map(key => history.entitiesByKey[key]) : Object.values(history.entitiesByKey || {})).filter(Boolean);
  }
  const rawLast = turns.at(-1);
  const window = conversationWindow(turns, limit);
  const last = window.turns.at(-1), requests = state.requests || [], flags = state.threadRuntimeStatus?.activeFlags || [];
  return {
    thread: { id: state.id, name: state.title, cwd: state.cwd, status: state.threadRuntimeStatus, ...threadOptions(state), ...window },
    runtime: { source: 'desktop', running: state.threadRuntimeStatus?.type === 'active', turnId: last?.status === 'inProgress' ? rawLast?.turnId || rawLast?.id || undefined : undefined, waitingForApproval: flags.includes('waitingOnApproval') || requests.some(req => /approval/i.test(req.method || req.type || '')), waitingForInput: flags.includes('waitingOnUserInput') || requests.some(req => /requestUserInput|elicitation/i.test(req.method || req.type || '')) },
    requestCount: requests.length
  };
}
// A background activity probe needs only authoritative runtime metadata. Never
// project turn.items (large tool/reasoning streams) into renderer messages here.
function desktopRuntime(state) {
  const type=state?.threadRuntimeStatus?.type;
  if (!['active','idle'].includes(type)) return null;
  let last=state.turns?.at(-1);
  const history=state.turnHistory?.kind==='canonical'?state.turnHistory.history:null;
  if(history){
    last=undefined;
    const islands=history.islands||[];
    for(let i=islands.length-1;i>=0&&!last;i--){const entries=islands[i].entries||[];for(let j=entries.length-1;j>=0&&!last;j--)last=history.entitiesByKey?.[entries[j].value];}
    if(!last)for(const key in history.entitiesByKey||{})if(Object.hasOwn(history.entitiesByKey,key)&&history.entitiesByKey[key])last=history.entitiesByKey[key];
  }
  const turnId=type==='idle'||last?.status==='inProgress'?last?.turnId||last?.id:undefined;
  return {running:type==='active',...(typeof turnId==='string'&&turnId?{turnId}: {})};
}
class DesktopIpc extends EventEmitter {
  constructor({ connectSocket = net.connect, timeoutMs = 10000, runtimeOnly = false } = {}) { super(); this.runtimeOnly = runtimeOnly; this.connectSocket = connectSocket; this.timeoutMs = timeoutMs; this.pending = new Map(); this.states = new Map(); this.owners = new Map(); this.followed = new Set(); this.timers = new Map(); this.signatures = new Map(); this.historyLimits = new Map(); this.clientId = 'initializing-client'; this.socket = null; this.connecting = null; }
  async connect() {
    if (this.socket && this.clientId !== 'initializing-client') return;
    if (this.connecting) return this.connecting;
    this.connecting = this._connect().finally(() => { this.connecting = null; }); return this.connecting;
  }
  async _connect() {
    const socket = this.connectSocket('\\\\.\\pipe\\codex-ipc'); this.socket = socket;
    const frames = new IpcFrames();
    socket.on('data', chunk => {
      try {
        frames.push(chunk, frame => this._receive(JSON.parse(frame.toString('utf8'))));
      } catch (error) { this.close(error); }
    });
    socket.on('error', error => this.close(error));
    socket.on('close', () => { if (this.socket === socket) this.close(new Error('Desktop Codex disconnected.')); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('Desktop connection timed out')); }, 1500);
      socket.once('connect', () => { clearTimeout(timer); resolve(); }); socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
    const response = await this.request('initialize', { clientType: 'petdock' }); this.clientId = response.result.clientId;
  }
  _write(message) { if (!this.socket || this.socket.destroyed) throw new Error('Desktop Codex is disconnected.'); const data = Buffer.from(JSON.stringify({ ...message, sourceClientId: this.clientId })), header = Buffer.alloc(4); header.writeUInt32LE(data.length); this.socket.write(Buffer.concat([header, data])); }
  request(method, params, targetClientId, timeout = this.timeoutMs) {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(`Desktop ${method} timed out. Check the task before retrying; the request may have been accepted.`)); }, timeout); this.pending.set(requestId, { resolve, reject, timer }); try { this._write({ type: 'request', requestId, method, params, targetClientId, timeoutMs: timeout, version: IPC_VERSIONS[method] || 0 }); } catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); } });
  }
  _receive(message) {
    if (message.type === 'response') { const pending = this.pending.get(message.requestId); if (!pending) return; this.pending.delete(message.requestId); clearTimeout(pending.timer); if (message.resultType === 'success') pending.resolve(message); else { const error = new Error(message.error || 'Desktop request failed'); error.code = message.error; pending.reject(error); } return; }
    if (message.type === 'client-discovery-request') { this._write({ type: 'client-discovery-response', requestId: message.requestId, response: { canHandle: false } }); return; }
    if (message.type !== 'broadcast' || (message.targetClientIds && !message.targetClientIds.includes(this.clientId))) return;
    // Codex 26.924 broadcasts real read-state changes separately from fetched
    // conversation content. Background reads must never acknowledge completion.
    if (message.method === 'thread-read-state-changed') {
      const params = message.params;
      if (message.version === 3 && params?.hostId === 'local' && params.hasUnreadTurn === false && typeof params.conversationId === 'string' && params.conversationId) {
        // Preserve completion-before-read ordering despite the stream debounce.
        const id = params.conversationId;
        if (this.timers.has(id)) { clearTimeout(this.timers.get(id)); this.timers.delete(id); this._emitState(id); }
        this.emit('thread-opened', id);
      }
      return;
    }
    if (message.method === 'thread-stream-following-status-requested') { if (this.followed.has(message.params?.conversationId)) this.follow(message.params.conversationId, message.sourceClientId); return; }
    if (message.method !== 'thread-stream-state-changed' || message.version !== 11 || message.params?.hostId !== 'local') return;
    const { conversationId: id, change } = message.params;
    if (!this.followed.has(id)) return;
    const old = this.states.get(id);
    if (change.type === 'snapshot') this.states.set(id, { state: change.conversationState, revision: change.revision });
    else if (change.type === 'patches' && old?.revision === change.baseRevision) { try { old.state = applyDesktopPatches(old.state, change.patches); old.revision = change.revision; } catch { this.states.delete(id); this.follow(id, message.sourceClientId); return; } }
    else { this.follow(id, message.sourceClientId); return; }
    this.emit('snapshot', id);
    if(this.runtimeOnly)return;
    const entry = this.states.get(id);
    if (change.type === 'patches' && !change.patches.some(patch => patchChangesMessages(entry.state, patch))) return;
    if (!this.timers.has(id)) this.timers.set(id, setTimeout(() => {
      this.timers.delete(id); this._emitState(id);
    }, 120));
  }
  _emitState(id) {
    if(this.runtimeOnly)return;
    const latest = this.states.get(id); if (!latest) return;
    const projected = desktopThread(latest.state, this.historyLimits.get(id) || 80), signature = JSON.stringify(projected);
    if (this.signatures.get(id) === signature) return;
    this.signatures.set(id, signature); this.emit('state', projected);
  }
  async owner(id) { await this.connect(); try { const response = await this.request('thread-owner-discovery', { hostId: 'local', conversationId: id }, undefined, 2500); this.owners.set(id, response.handledByClientId); return response.handledByClientId; } catch (error) { if (error.code === 'no-client-found') { this.owners.delete(id); return null; } throw error; } }
  follow(id, owner) { this.followed.add(id); this._write({ type: 'broadcast', method: 'thread-stream-following-changed', params: { hostId: 'local', conversationId: id, following: true }, targetClientIds: owner ? [owner] : undefined, version: 1 }); }
  unfollow(id) {
    if (!this.followed.has(id)) return;
    this._write({type:'broadcast',method:'thread-stream-following-changed',params:{hostId:'local',conversationId:id,following:false},targetClientIds:this.owners.get(id)?[this.owners.get(id)]:undefined,version:1});
    this.followed.delete(id); this.states.delete(id); this.signatures.delete(id); this.historyLimits.delete(id);
    clearTimeout(this.timers.get(id)); this.timers.delete(id);
  }
  async read(id, owner, limit = 80) {
    this.historyLimits.set(id, limit);
    // Keep a small working set, rather than every conversation ever opened.
    if (this.states.has(id)) {const entry=this.states.get(id);this.states.delete(id);this.states.set(id,entry);}
    const maximum=this.states.has(id)?4:3;
    for (const other of this.states.keys()) {if(this.states.size <= maximum)break;if(other!==id)this.unfollow(other);}
    if (!this.states.has(id)) await new Promise(resolve => { const done = received => { if (received !== id) return; clearTimeout(timer); this.off('snapshot', done); resolve(); }; const timer = setTimeout(() => { this.off('snapshot', done); resolve(); }, 2000); this.on('snapshot', done); this.follow(id, owner); });
    const entry = this.states.get(id); return entry ? desktopThread(entry.state, limit) : null;
  }
  async readRuntime(id, owner) {
    if(!this.states.has(id))await new Promise((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);this.off('snapshot',done);this.off('disconnected',failed);};
      const done=received=>{if(received===id){cleanup();resolve();}};
      const failed=error=>{cleanup();reject(error);};
      const timer=setTimeout(()=>{cleanup();resolve();},2000);
      this.on('snapshot',done);this.on('disconnected',failed);
      try{this.follow(id,owner);}catch(error){failed(error);}
    });
    return desktopRuntime(this.states.get(id)?.state);
  }
  async send(id, text, owner, images = [], options = {}) {
    const input = promptInputs(text, images), overrides = modelOptions(options);
    if (Object.keys(overrides).length && !this.states.has(id)) await this.read(id, owner);
    const state = this.states.get(id)?.state;
    if (Object.keys(overrides).length && !state) throw new Error('Codex task settings are not available yet. Open the task and try again.');
    // A collaboration mode has its own model settings and otherwise wins over
    // turn/start overrides. Preserve the existing mode and developer instructions.
    const inherited = state?.latestThreadSettings?.collaborationMode ?? state?.latestCollaborationMode;
    const collaborationMode = inherited && Object.keys(overrides).length ? {
      ...inherited, settings: {...inherited.settings,
        ...(overrides.model ? {model: overrides.model} : {}),
        ...(overrides.effort ? {reasoning_effort: overrides.effort} : {})}
    } : undefined;
    this.follow(id, owner);
    const response = await this.request('thread-follower-start-turn', {conversationId: id,
      turnStart: {request: {threadId: id, input, ...overrides, ...(collaborationMode ? {collaborationMode} : {})}, context: {inheritThreadSettings: true}}}, owner, 30000);
    return response.result.result;
  }
  async steer(id, text, owner, images = []) {
    const input = promptInputs(text, images), clientUserMessageId = randomUUID();
    const cwd = this.states.get(id)?.state?.cwd;
    // Match the desktop's follow-up restore metadata, while leaving its active
    // turn and permissions under the existing writer's control.
    const restoreMessage = { id: clientUserMessageId, text, createdAt: Date.now(), ...(cwd ? { cwd } : {}), context: {
      prompt: text, addedFiles: [], fileAttachments: [], ideContext: null,
      imageAttachments: [], ...(cwd ? { workspaceRoots: [cwd] } : {})
    } };
    this.follow(id, owner);
    const response = await this.request('thread-follower-steer-turn', { conversationId: id, input, restoreMessage, attachments: [], clientUserMessageId }, owner, 30000);
    return response.result.result;
  }
  async interrupt(id, turnId, owner) { return (await this.request('thread-follower-interrupt-turn', { conversationId: id, mode: 'user-stop', expectedTurnId: turnId }, owner)).result; }
  close(error = new Error('Desktop connection closed.')) { const socket = this.socket; this.socket = null; this.clientId = 'initializing-client'; for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); this.states.clear(); this.signatures.clear(); this.historyLimits.clear(); this.owners.clear(); this.followed.clear(); socket?.destroy(); this.emit('disconnected', error); }
}

/** Newline-delimited app-server protocol. Never resolves approvals automatically. */
class CodexBridge extends EventEmitter {
  constructor({ executable, spawnProcess = spawn, timeoutMs = 30000, connectTimeoutMs = 12000, connectionModes = ['shared', 'standalone'], runtimeClientFactory = () => new DesktopIpc({runtimeOnly:true,timeoutMs:2500}), desktop = spawnProcess === spawn && process.platform === 'win32' ? new DesktopIpc() : null } = {}) {
    super();
    Object.assign(this, { executable: executable || 'codex.exe', executableOverride: executable, spawnProcess, timeoutMs, connectTimeoutMs });
    this.pending = new Map(); this.requests = new Set(); this.resumed = new Set(); this.resuming = new Map(); this.nextId = 1;
    this.child = null; this.connected = false; this.connecting = null; this.mode = null;
    this.connectionModes = connectionModes; this.historyReader = null; this.unsupportedHistory = new Set();
    this.runtimeClientFactory=runtimeClientFactory;this.runtimeProbes=new Set();this.runtimeGeneration=0;
    this.desktop = desktop; this.deltas = new Map(); this.deltaTimer = null;
    this.activity = spawnProcess === spawn && connectionModes.includes('shared') ? new CodexActivity({ list: () => this._rpc('thread/list', { limit: 64, sortKey: 'updated_at', archived: false, useStateDbOnly: true }, 5000), readRuntime: id => this._readActivityRuntime(id) }) : null;
    this.activity?.on('activity', activity => this.emit('activity', activity));
    desktop?.on('state', state => this.emit('notification', { method: 'petdock/threadState', params: this.incrementalThreads?.has(state.thread?.id)?{...state,partial:true}:state }));
    desktop?.on('thread-opened', threadId => this.emit('thread-opened', threadId));
  }
  async connect() {
    if (this.connected) return { mode: this.mode };
    if (this.connecting) return this.connecting;
    this.connecting = this._connect().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async _connect() {
    this.emit('status', { state: 'connecting', detail: 'Connecting to Codex…' });
    if (this.spawnProcess === spawn) {
      try {
        this.executable = await resolveCodexExecutable({env: {...process.env, ...(this.executableOverride ? {PETDOCK_CODEX_PATH:this.executableOverride} : {})}});
      } catch (error) {
        this.emit('status', {state:'error',detail:error.message});
        throw error;
      }
    }
    let proxyError;
    for (const mode of this.connectionModes) {
      try {
        this._launch(mode);
        await this._rpc('initialize', { clientInfo: { name: 'petdock', title: 'Ogle', version: '1.0.0' }, capabilities: { experimentalApi: true, requestAttestation: false } }, this.connectTimeoutMs);
        this._write({ method: 'initialized', params: {} });
        let desktopConnected = false;
        if (this.desktop) try { await this.desktop.connect(); desktopConnected = true; } catch { /* Desktop can be closed; app-server still supports unowned tasks. */ }
        this.connected = true; this.mode = desktopConnected ? 'desktop' : mode;
        this.activity?.start();
        this.emit('status', { state: 'connected', mode: this.mode, detail: desktopConnected ? 'Connected to Codex desktop task ownership and live updates.' : mode === 'shared' ? 'Connected to shared Codex server.' : 'Connected to local Codex history through a separate server. Do not send to a task running in the desktop app.', ...(proxyError ? { fallbackReason: proxyError.message } : {}) });
        return { mode: this.mode };
      } catch (error) {
        this._dispose(error);
        if (mode === 'shared') proxyError = error;
        else { this.emit('status', { state: 'error', detail: error.message }); throw error; }
      }
    }
  }
  _launch(mode) {
    const child = this.spawnProcess(this.executable, ['app-server', ...(mode === 'shared' ? ['proxy'] : ['--stdio'])], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    let buffer = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    child.stdout.on('data', chunk => {
      if (this.child !== child) return;
      buffer += chunk;
      if (buffer.length > 32 * 1024 * 1024) return this._failed(child, new Error('Codex response exceeded transport limit.'));
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
        if (!line) continue;
        try { this._receive(JSON.parse(line)); } catch (error) { this._failed(child, new Error(`Invalid Codex protocol message: ${error.message}`)); return; }
      }
    });
    child.on('error', error => this._failed(child, error));
    child.stdin.on('error', error => this._failed(child, error));
    child.on('exit', (code, signal) => this._failed(child, new Error(`Codex connection closed (${signal || code}). ${stderr.trim()}`)));
  }
  _failed(child, error) {
    if (this.child !== child) return;
    const wasConnected = this.connected;
    this._dispose(error);
    if (wasConnected) this.emit('status', { state: 'error', detail: error.message });
  }
  _receive(message) {
    if (message.method) {
      if (message.id !== undefined) { this.requests.add(message.id); this.emit('request', message); }
      else this._notification(message);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(message.id);
    if (message.error) { const error = new Error(message.error.message || 'Codex request failed'); error.code = message.error.code; pending.reject(error); }
    else pending.resolve(message.result);
  }
  _flushDeltas() {
    clearTimeout(this.deltaTimer); this.deltaTimer = null;
    for (const message of this.deltas.values()) this.emit('notification', message);
    this.deltas.clear();
  }
  _notification(message) {
    const { method, params = {} } = message;
    if (method === 'item/agentMessage/delta') {
      const key = JSON.stringify([params.threadId, params.turnId, params.itemId]);
      const old = this.deltas.get(key);
      if (old) old.params.delta += params.delta || '';
      else this.deltas.set(key, { method, params: { ...params, delta: params.delta || '' } });
      if (!this.deltaTimer) this.deltaTimer = setTimeout(() => this._flushDeltas(), 120);
      return;
    }
    // Requests take the separate request path, so approvals/input cannot be lost.
    if (method.startsWith('item/')) {
      if (!['item/started', 'item/completed'].includes(method)) return;
      const item = messageItem(params.item); if (!item) return;
      this._flushDeltas();
      this.emit('notification', { method, params: { ...params, item } }); return;
    }
    if (method === 'turn/completed') this._flushDeltas();
    if (params.turn) { this.emit('notification', { ...message, params: { ...params, turn: messageTurn(params.turn) } }); return; }
    if (params.thread) { this.emit('notification', { ...message, params: { ...params, thread: projectThread(params.thread) } }); return; }
    this.emit('notification', message);
  }
  _write(message) {
    if (!this.child || this.child.stdin.destroyed) throw new Error('Codex is not connected.');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  _rpc(method, params, timeout = this.timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} timed out. The operation may still be running; check task history before retrying.`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this._write({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async listThreads({ cursor, searchTerm, cwd, archived = false } = {}) {
    await this.connect();
    const result = await this._rpc('thread/list', { cursor, searchTerm, cwd, limit: 60, sortKey: 'updated_at', archived });
    // Codex's disk-backed listing can emit one row for each rollout file even
    // when old resume files share one session_meta ID. Consolidate at the data
    // boundary, before any UI work; never alter or delete conversation archives.
    // Keep server ordering and pagination, and keep distinct same-title tasks.
    const unique = rows => { const seen = new Set(); return rows.filter(row => {
      if (!row || typeof row.id !== 'string' || !row.id || seen.has(row.id)) return false;
      seen.add(row.id); return true;
    }); };
    if (Array.isArray(result)) return unique(result);
    if (Array.isArray(result?.data)) return { ...result, data: unique(result.data) };
    if (Array.isArray(result?.threads)) return { ...result, threads: unique(result.threads) };
    return result;
  }
  async readThread(id, {messageLimit = 80, incremental = false, historyCursor} = {}) {
    if(!Number.isInteger(messageLimit) || messageLimit < 1 || messageLimit > 10000)throw new Error('Invalid conversation history limit');
    await this.connect();
    if(incremental){
      this.historyPages ||= new CodexHistoryPages({rpc:(method,params)=>this._rpc(method,params),projectItem:messageItem});
      this.rolloutPages ||= new CodexRolloutPages();this.incrementalThreads ||= new Set();this.incrementalThreads.add(id);
      let result;
      if(historyCursor&&this.rolloutPages.cursors.has(historyCursor)){const metadata=await this._rpc('thread/read',{threadId:id,includeTurns:false});return this.rolloutPages.read(metadata.thread,{limit:messageLimit,cursor:historyCursor});}
      try{result=await this.historyPages.read(id,{limit:messageLimit,cursor:historyCursor});}
      catch(error){if(historyCursor||!/(?:list_(?:items|turns) is not supported yet|unknown method|method not found|unsupported method)/i.test(error.message))throw error;
        const metadata=await this._rpc('thread/read',{threadId:id,includeTurns:false});result=await this.rolloutPages.read(metadata.thread,{limit:messageLimit});
      }
      // Desktop v11 has no delta-only subscription: its first snapshot is full.
      // Keep it once for patch authority and live streaming; do not download it
      // again when loading earlier history. Emitted windows are additive.
      if(!historyCursor&&this.desktop){try{const owner=await this.desktop.owner(id);if(owner){const live=await this.desktop.read(id,owner,80);if(live){result.runtime=live.runtime;if(result.thread.history.source==='rollout')result.thread.turns=live.thread.turns;result.thread={...result.thread,...threadOptions(this.desktop.states.get(id)?.state||{})};result.thread.history.liveSource='desktop-snapshot';}}}catch{/* Bounded app-server history remains available. */}}
      return result;
    }
    if (this.desktop) { try { const owner = await this.desktop.owner(id); if (owner) { const result = await this.desktop.read(id, owner, messageLimit); if (result) return result; } } catch { /* Disk history remains readable when desktop closes. */ } }
    let result;
    if (!this.unsupportedHistory.has(id)) {
      try { result = await this._rpc('thread/read', { threadId: id, includeTurns: true }); }
      catch (error) {
        // A capability failure in some shared-server history backends. Other
        // errors, including permissions and missing tasks, must remain visible.
        if (!this.connectionModes.includes('shared') || !/^list_turns is not supported yet[.!]?$/i.test(error.message.trim())) throw error;
        this.unsupportedHistory.add(id);
      }
    }
    if (!result) {
      // Only read disk history. Never resume/start or disturb the desktop writer.
      this.historyReader ||= new CodexBridge({ executable: this.executable, spawnProcess: this.spawnProcess, timeoutMs: this.timeoutMs, connectTimeoutMs: this.connectTimeoutMs, connectionModes: ['standalone'], desktop: null });
      return this.historyReader.readThread(id, {messageLimit});
    }
    return result.thread ? { ...result, thread: projectThread(result.thread, messageLimit) } : result;
  }
  async readRuntime(id) {
    await this.connect();
    if(this.desktop){try{const owner=await this.desktop.owner(id);if(owner){const cached=desktopRuntime(this.desktop.states.get(id)?.state);return {runtime:cached?{source:'desktop',...cached}:null};}}catch{/* Metadata remains readable after the desktop exits. */}}
    const result=await this._rpc('thread/read',{threadId:id,includeTurns:false});
    const type=result.thread?.status?.type;if(!['active','idle','systemError'].includes(type))return {runtime:null};
    if(type!=='active')return {runtime:{source:'app-server',running:false}};
    const latest=await this._rpc('thread/turns/list',{threadId:id,limit:1,sortDirection:'desc',itemsView:'notLoaded'});
    return {runtime:{source:'app-server',running:true,...(latest.data?.[0]?.id?{turnId:latest.data[0].id}:{})}};
  }
  async listModels() {
    await this.connect();
    const data = [], seen = new Set(); let cursor;
    do {
      const page = await this._rpc('model/list', {limit: 100, includeHidden: false, ...(cursor ? {cursor} : {})});
      for (const item of page.data || []) if (!item.hidden && typeof item.model === 'string' && !data.some(row => row.model === item.model)) data.push(item);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error('Codex returned a repeated model page.');
      if (cursor) seen.add(cursor);
    } while (cursor && seen.size < 20);
    return {data};
  }
  async renameThread(id, name) {
    if(typeof id !== 'string' || !id.trim())throw new Error('Invalid Codex conversation ID');
    if(typeof name !== 'string' || !name.trim() || name.trim().length > 200)throw new Error('Enter a conversation name of 1–200 characters');
    await this.connect();return this._rpc('thread/name/set',{threadId:id,name:name.trim()});
  }
  async archiveThread(id) {
    if(typeof id !== 'string' || !id.trim())throw new Error('Invalid Codex conversation ID');
    await this.connect();
    let runtime;
    // A fresh probe avoids trusting a cached conversation snapshot while deleting.
    const client=this.runtimeClientFactory();
    try {const owner=await client.owner(id);if(owner){runtime=await client.readRuntime(id,owner);if(!runtime)throw new Error('Cannot check this conversation yet. Try again once Codex is ready.');}}
    finally {client.close();}
    if(!runtime){const result=await this._rpc('thread/read',{threadId:id,includeTurns:false});const status=result?.thread?.status?.type;if(!['active','idle','notLoaded','systemError'].includes(status))throw new Error('Cannot check this conversation yet. Try again once Codex is ready.');runtime={running:status==='active'};}
    if(runtime.running)throw new Error('Stop the active Codex conversation before removing it.');
    return this._rpc('thread/archive',{threadId:id});
  }
  async unarchiveThread(id) {
    if(typeof id !== 'string' || !id.trim())throw new Error('Invalid Codex conversation ID');
    await this.connect();return this._rpc('thread/unarchive',{threadId:id});
  }
  async accountRead() { await this.connect(); return this._rpc('account/read', { refreshToken: false }); }
  async login() { await this.connect(); return this._rpc('account/login/start', { type: 'chatgpt' }); }
  async logout() { await this.connect(); return this._rpc('account/logout', {}); }
  async startThread(cwd) {
    await this.connect();
    const result = await this._rpc('thread/start', { ...(cwd ? { cwd } : {}), approvalPolicy: 'on-request', sandbox: 'workspace-write' });
    this.resumed.add(result.thread.id); return result;
  }
  async sendTurn(threadId, text, images = [], options = {}) {
    const input = promptInputs(text, images), overrides = modelOptions(options);
    await this.connect();
    if (this.desktop) {
      let owner;
      try { owner = await this.desktop.owner(threadId); } catch (error) { if (this.mode === 'desktop' || this.desktop.owners.has(threadId)) throw error; }
      if (owner) return this.desktop.send(threadId, text, owner, images, overrides);
    }
    if (!this.resumed.has(threadId)) {
      if (!this.resuming.has(threadId)) this.resuming.set(threadId, this._rpc('thread/resume', { threadId, approvalPolicy: 'on-request', sandbox: 'workspace-write' }).then(() => this.resumed.add(threadId)).finally(() => this.resuming.delete(threadId)));
      await this.resuming.get(threadId);
    }
    return this._rpc('turn/start', { threadId, approvalPolicy: 'on-request', input, ...overrides });
  }
  async steerTurn(threadId, text, images = [], expectedTurnId) {
    const input = promptInputs(text, images);
    await this.connect();
    if (this.desktop) {
      let owner;
      try { owner = await this.desktop.owner(threadId); }
      catch (error) { if (this.mode === 'desktop' || this.desktop.owners.has(threadId)) throw error; }
      if (owner) return this.desktop.steer(threadId, text, owner, images);
    }
    // Never resume a thread to steer: that can compete with its current writer.
    if (typeof expectedTurnId !== 'string' || !expectedTurnId.trim() || ['desktop', 'pending'].includes(expectedTurnId)) throw new Error('The active turn is not available yet. Wait for Codex to start or queue the message.');
    return this._rpc('turn/steer', { threadId, input, expectedTurnId });
  }
  async interrupt(threadId, turnId) { await this.connect(); if (this.desktop) { const owner = await this.desktop.owner(threadId); if (owner) return this.desktop.interrupt(threadId, turnId, owner); } return this._rpc('turn/interrupt', { threadId, turnId }); }
  respond(id, result) {
    if (!this.requests.has(id)) throw new Error('This Codex request is no longer pending.');
    this._write({ id, result }); this.requests.delete(id);
  }
  async _readActivityRuntime(id) {
    if(typeof id!=='string'||!id||this.runtimeProbes.size>=2)return null;
    const generation=this.runtimeGeneration,client=this.runtimeClientFactory();this.runtimeProbes.add(client);
    try {const owner=await client.owner(id);if(!owner||generation!==this.runtimeGeneration)return null;const result=await client.readRuntime(id,owner);return generation===this.runtimeGeneration?result:null;}
    catch{return null;}
    finally{this.runtimeProbes.delete(client);client.close();}
  }
  _dispose(error = new Error('Codex connection closed.')) {
    this.activity?.stop();++this.runtimeGeneration;for(const client of this.runtimeProbes)client.close(error);this.runtimeProbes.clear();
    const child = this.child; this.child = null; this.connected = false;
    this.resumed.clear(); this.resuming.clear(); this.requests.clear();
    this.historyPages?.clear();this.rolloutPages?.clear();this.incrementalThreads?.clear();this.unsupportedHistory.clear(); this.historyReader?.close(); this.historyReader = null;
    clearTimeout(this.deltaTimer); this.deltaTimer = null; this.deltas.clear();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    if (child) { child.stdin.destroy(); child.kill(); }
  }
  close() { this.desktop?.close(); this._dispose(); this.emit('status', { state: 'disconnected', detail: 'Codex disconnected.' }); }
}
module.exports = { CodexBridge, DesktopIpc, applyDesktopPatches, desktopThread, desktopRuntime, conversationWindow, threadOptions, promptInputs, modelOptions, IMAGE_LIMITS };
