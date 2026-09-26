'use strict';
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { imageSize } = require('image-size');
const { resolveCodexExecutable } = require('./codex-executable.cjs');

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
const IPC_VERSIONS = { 'thread-owner-discovery': 1, 'thread-follower-start-turn': 2, 'thread-follower-interrupt-turn': 4, 'thread-stream-following-changed': 1 };
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
function projectThread(thread) { return { id: thread.id, name: thread.name, cwd: thread.cwd, status: thread.status, turns: (thread.turns || []).map(messageTurn) }; }
function patchChangesMessages(state, patch) {
  const index = patch.path.indexOf('items');
  if (index < 0 || patch.path.length <= index + 2 || patch.op === 'remove') return true;
  let item = state;
  for (const key of patch.path.slice(0, index + 2)) item = item?.[key];
  return ['usermessage', 'agentmessage'].includes(item?.type?.toLowerCase());
}
function desktopThread(state) {
  const history = state.turnHistory?.kind === 'canonical' ? state.turnHistory.history : null;
  let turns = state.turns || [];
  if (history) {
    const keys = history.islands?.flatMap(island => island.entries?.map(entry => entry.value) || []) || [];
    turns = (keys.length ? keys.map(key => history.entitiesByKey[key]) : Object.values(history.entitiesByKey || {})).filter(Boolean);
  }
  const rawLast = turns.at(-1);
  turns = turns.map(messageTurn);
  const last = turns.at(-1), requests = state.requests || [], flags = state.threadRuntimeStatus?.activeFlags || [];
  return {
    thread: { id: state.id, name: state.title, cwd: state.cwd, status: state.threadRuntimeStatus, turns },
    runtime: { source: 'desktop', running: state.threadRuntimeStatus?.type === 'active', turnId: last?.status === 'inProgress' ? rawLast?.turnId || rawLast?.id || undefined : undefined, waitingForApproval: flags.includes('waitingOnApproval') || requests.some(req => /approval/i.test(req.method || req.type || '')), waitingForInput: flags.includes('waitingOnUserInput') || requests.some(req => /requestUserInput|elicitation/i.test(req.method || req.type || '')) },
    requestCount: requests.length
  };
}
class DesktopIpc extends EventEmitter {
  constructor({ connectSocket = net.connect, timeoutMs = 10000 } = {}) { super(); this.connectSocket = connectSocket; this.timeoutMs = timeoutMs; this.pending = new Map(); this.states = new Map(); this.owners = new Map(); this.followed = new Set(); this.timers = new Map(); this.signatures = new Map(); this.clientId = 'initializing-client'; this.socket = null; this.connecting = null; }
  async connect() {
    if (this.socket && this.clientId !== 'initializing-client') return;
    if (this.connecting) return this.connecting;
    this.connecting = this._connect().finally(() => { this.connecting = null; }); return this.connecting;
  }
  async _connect() {
    const socket = this.connectSocket('\\\\.\\pipe\\codex-ipc'); this.socket = socket;
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        while (buffer.length >= 4) {
          const length = buffer.readUInt32LE(0);
          if (!length || length > 64 * 1024 * 1024) throw new Error('Invalid desktop IPC frame');
          if (buffer.length < length + 4) break;
          const message = JSON.parse(buffer.subarray(4, length + 4).toString('utf8')); buffer = buffer.subarray(length + 4); this._receive(message);
        }
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
    if (message.method === 'thread-stream-following-status-requested') { if (this.followed.has(message.params?.conversationId)) this.follow(message.params.conversationId, message.sourceClientId); return; }
    if (message.method !== 'thread-stream-state-changed' || message.version !== 11 || message.params?.hostId !== 'local') return;
    const { conversationId: id, change } = message.params;
    if (!this.followed.has(id)) return;
    const old = this.states.get(id);
    if (change.type === 'snapshot') this.states.set(id, { state: change.conversationState, revision: change.revision });
    else if (change.type === 'patches' && old?.revision === change.baseRevision) { try { old.state = applyDesktopPatches(old.state, change.patches); old.revision = change.revision; } catch { this.states.delete(id); this.follow(id, message.sourceClientId); return; } }
    else { this.follow(id, message.sourceClientId); return; }
    this.emit('snapshot', id);
    const entry = this.states.get(id);
    if (change.type === 'patches' && !change.patches.some(patch => patchChangesMessages(entry.state, patch))) return;
    if (!this.timers.has(id)) this.timers.set(id, setTimeout(() => {
      this.timers.delete(id); const latest = this.states.get(id); if (!latest) return;
      const projected = desktopThread(latest.state), signature = JSON.stringify(projected);
      if (this.signatures.get(id) === signature) return;
      this.signatures.set(id, signature); this.emit('state', projected);
    }, 120));
  }
  async owner(id) { await this.connect(); try { const response = await this.request('thread-owner-discovery', { hostId: 'local', conversationId: id }, undefined, 2500); this.owners.set(id, response.handledByClientId); return response.handledByClientId; } catch (error) { if (error.code === 'no-client-found') { this.owners.delete(id); return null; } throw error; } }
  follow(id, owner) { this.followed.add(id); this._write({ type: 'broadcast', method: 'thread-stream-following-changed', params: { hostId: 'local', conversationId: id, following: true }, targetClientIds: owner ? [owner] : undefined, version: 1 }); }
  async read(id, owner) {
    if (!this.states.has(id)) await new Promise(resolve => { const done = received => { if (received !== id) return; clearTimeout(timer); this.off('snapshot', done); resolve(); }; const timer = setTimeout(() => { this.off('snapshot', done); resolve(); }, 2000); this.on('snapshot', done); this.follow(id, owner); });
    const entry = this.states.get(id); return entry ? desktopThread(entry.state) : null;
  }
  async send(id, text, owner, images = []) { const input = promptInputs(text, images); this.follow(id, owner); const response = await this.request('thread-follower-start-turn', { conversationId: id, turnStart: { request: { threadId: id, input }, context: { inheritThreadSettings: true } } }, owner, 30000); return response.result.result; }
  async interrupt(id, turnId, owner) { return (await this.request('thread-follower-interrupt-turn', { conversationId: id, mode: 'user-stop', expectedTurnId: turnId }, owner)).result; }
  close(error = new Error('Desktop connection closed.')) { const socket = this.socket; this.socket = null; this.clientId = 'initializing-client'; for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); this.states.clear(); this.signatures.clear(); this.owners.clear(); this.followed.clear(); socket?.destroy(); this.emit('disconnected', error); }
}

/** Newline-delimited app-server protocol. Never resolves approvals automatically. */
class CodexBridge extends EventEmitter {
  constructor({ executable, spawnProcess = spawn, timeoutMs = 30000, connectTimeoutMs = 12000, desktop = spawnProcess === spawn && process.platform === 'win32' ? new DesktopIpc() : null } = {}) {
    super();
    Object.assign(this, { executable: executable || 'codex.exe', executableOverride: executable, spawnProcess, timeoutMs, connectTimeoutMs });
    this.pending = new Map(); this.requests = new Set(); this.resumed = new Set(); this.resuming = new Map(); this.nextId = 1;
    this.child = null; this.connected = false; this.connecting = null; this.mode = null;
    this.desktop = desktop; this.deltas = new Map(); this.deltaTimer = null;
    desktop?.on('state', state => this.emit('notification', { method: 'petdock/threadState', params: state }));
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
    for (const mode of ['shared', 'standalone']) {
      try {
        this._launch(mode);
        await this._rpc('initialize', { clientInfo: { name: 'petdock', title: 'Ogle', version: '0.5.10' }, capabilities: { experimentalApi: true, requestAttestation: false } }, this.connectTimeoutMs);
        this._write({ method: 'initialized', params: {} });
        let desktopConnected = false;
        if (this.desktop) try { await this.desktop.connect(); desktopConnected = true; } catch { /* Desktop can be closed; app-server still supports unowned tasks. */ }
        this.connected = true; this.mode = desktopConnected ? 'desktop' : mode;
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
  async listThreads({ cursor, searchTerm, cwd } = {}) {
    await this.connect();
    return this._rpc('thread/list', { cursor, searchTerm, cwd, limit: 60, sortKey: 'updated_at', archived: false });
  }
  async readThread(id) {
    await this.connect();
    if (this.desktop) { try { const owner = await this.desktop.owner(id); if (owner) { const result = await this.desktop.read(id, owner); if (result) return result; } } catch { /* Disk history remains readable when desktop closes. */ } }
    const result = await this._rpc('thread/read', { threadId: id, includeTurns: true });
    return result.thread ? { ...result, thread: projectThread(result.thread) } : result;
  }
  async accountRead() { await this.connect(); return this._rpc('account/read', { refreshToken: false }); }
  async login() { await this.connect(); return this._rpc('account/login/start', { type: 'chatgpt' }); }
  async logout() { await this.connect(); return this._rpc('account/logout', {}); }
  async startThread(cwd) {
    await this.connect();
    const result = await this._rpc('thread/start', { ...(cwd ? { cwd } : {}), approvalPolicy: 'on-request', sandbox: 'workspace-write' });
    this.resumed.add(result.thread.id); return result;
  }
  async sendTurn(threadId, text, images = []) {
    const input = promptInputs(text, images);
    await this.connect();
    if (this.desktop) {
      let owner;
      try { owner = await this.desktop.owner(threadId); } catch (error) { if (this.mode === 'desktop' || this.desktop.owners.has(threadId)) throw error; }
      if (owner) return this.desktop.send(threadId, text, owner, images);
    }
    if (!this.resumed.has(threadId)) {
      if (!this.resuming.has(threadId)) this.resuming.set(threadId, this._rpc('thread/resume', { threadId, approvalPolicy: 'on-request', sandbox: 'workspace-write' }).then(() => this.resumed.add(threadId)).finally(() => this.resuming.delete(threadId)));
      await this.resuming.get(threadId);
    }
    return this._rpc('turn/start', { threadId, approvalPolicy: 'on-request', input });
  }
  async interrupt(threadId, turnId) { await this.connect(); if (this.desktop) { const owner = await this.desktop.owner(threadId); if (owner) return this.desktop.interrupt(threadId, turnId, owner); } return this._rpc('turn/interrupt', { threadId, turnId }); }
  respond(id, result) {
    if (!this.requests.has(id)) throw new Error('This Codex request is no longer pending.');
    this._write({ id, result }); this.requests.delete(id);
  }
  _dispose(error = new Error('Codex connection closed.')) {
    const child = this.child; this.child = null; this.connected = false;
    this.resumed.clear(); this.resuming.clear(); this.requests.clear();
    clearTimeout(this.deltaTimer); this.deltaTimer = null; this.deltas.clear();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    if (child) { child.stdin.destroy(); child.kill(); }
  }
  close() { this.desktop?.close(); this._dispose(); this.emit('status', { state: 'disconnected', detail: 'Codex disconnected.' }); }
}
module.exports = { CodexBridge, DesktopIpc, applyDesktopPatches, desktopThread, promptInputs, IMAGE_LIMITS };
