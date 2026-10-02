'use strict';
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');

// Visual activity only: a rollout is not an authority for sending/steering or
// draining queues. Read append offsets, never repeatedly load conversation history.
class CodexActivity extends EventEmitter {
  constructor({ list, readRuntime, intervalMs = 2000, refreshMs = 10000, now = Date.now } = {}) {
    super(); Object.assign(this, { list, readRuntime, intervalMs, refreshMs, now });
    this.files = new Map(); this.nextRefresh = 0; this.timer = null; this.generation = 0;
    this.startedAt = this.now(); this.catalogReady = false;
    this.probes = []; this.probesRunning = 0;
  }
  start() { if (this.timer) return; const generation = ++this.generation; const run = async () => { try { await this.tick(); } catch { /* Optional visual source; reconnect on next tick. */ } if (generation === this.generation) { this.timer = setTimeout(run, this.intervalMs); this.timer.unref?.(); } }; this.timer = setTimeout(run, 0); this.timer.unref?.(); }
  stop() { ++this.generation; clearTimeout(this.timer); this.timer = null; this.files.clear(); this.probes.length = 0; this.nextRefresh = 0; this.catalogReady = false; this.startedAt = this.now(); }
  queueProbe(file) {
    if (!this.readRuntime || file.probed) return;
    file.probed = true;
    this.probes.push({ file, revision: file.activityRevision || 0, generation: this.generation });
    this.drainProbes();
  }
  drainProbes() {
    while (this.probesRunning < 2 && this.probes.length) {
      const { file, revision, generation } = this.probes.shift();
      ++this.probesRunning;
      Promise.resolve().then(() => generation === this.generation ? this.readRuntime(file.id) : null).then(runtime => {
        if (generation !== this.generation || this.files.get(file.id) !== file || (file.activityRevision || 0) !== revision || file.active) return;
        if (runtime?.running !== true || typeof runtime.turnId !== 'string' || !runtime.turnId) return;
        file.active = runtime.turnId;
        this.emit('activity', { threadId: file.id, turnId: runtime.turnId, running: true, source: 'desktop-baseline', visualOnly: true, baseline: true });
      }).catch(() => {}).finally(() => { --this.probesRunning; this.drainProbes(); });
    }
  }
  async tick() {
    const generation = this.generation;
    if (this.now() >= this.nextRefresh) {
      this.nextRefresh = this.now() + this.refreshMs;
      const result = await this.list(), rows = result?.data || result?.threads || result || [];
      if (generation !== this.generation) return;
      const seen = new Set();
      for (const row of rows.slice(0, 64)) {
        if (typeof row?.id !== 'string' || typeof row.path !== 'string' || !row.path.endsWith('.jsonl')) continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        if (!this.files.has(row.id) || this.files.get(row.id).path !== row.path) {
          if (this.files.size >= 128 && !this.files.has(row.id)) continue;
          this.files.set(row.id, { id: row.id, path: row.path, offset: null, pending: '', active: null, initial: !this.catalogReady });
        }
      }
      // Preserve actively observed tasks even when they leave the recent page.
      const known = new Set(rows.map(row => row.id));
      for (const [id, file] of this.files) if (!known.has(id) && !file.active) this.files.delete(id);
      this.catalogReady = true;
    }
    for (const file of this.files.values()) { if (generation !== this.generation) break; await this.read(file, generation).catch(() => {}); }
  }
  async read(file, generation = this.generation) {
    const handle = await fs.open(file.path, 'r');
    try {
      const { size } = await handle.stat();
      if (file.offset != null && size < file.offset) { file.initial = true; file.activityRevision = (file.activityRevision || 0) + 1; }
      const baseline = file.offset == null || size < file.offset;
      if (baseline) { file.offset = Math.max(0, size - 65536); file.pending = ''; file.active = null; }
      const start = file.offset, count = Math.min(size - start, 1024 * 1024);
      if (!count) return;
      const buffer = Buffer.allocUnsafe(count); const { bytesRead } = await handle.read(buffer, 0, count, start);
      if (generation !== this.generation) return;
      file.offset += bytesRead;
      let text = file.pending + buffer.subarray(0, bytesRead).toString('utf8');
      if (baseline && start > 0) text = text.slice(text.indexOf('\n') + 1);
      const lines = text.split('\n'); file.pending = lines.pop();
      if (file.pending.length > 1024 * 1024) file.pending = '';
      let baselineActive = false;
      let baselineCandidate = null;
      let baselineTerminal = false;
      for (const line of lines) {
        if (!line.includes('"event_msg"')) continue;
        let event; try { event = JSON.parse(line); } catch { continue; }
        const payload = event.payload;
        if (event.type !== 'event_msg' || !payload?.turn_id) continue;
        if (baseline && ['task_complete', 'turn_aborted'].includes(payload.type)) baselineTerminal = true;
        if (baseline && ['task_started', 'item_completed'].includes(payload.type)) baselineTerminal = false;
        if (!baseline && ['task_started', 'item_completed', 'task_complete', 'turn_aborted'].includes(payload.type)) file.activityRevision = (file.activityRevision || 0) + 1;
        if (baseline && (file.initial || Date.parse(event.timestamp) < this.startedAt)) {
          // Historical completion must never produce a fresh done animation.
          // Fresh item evidence can discover a turn already running at startup.
          const age = this.now() - Date.parse(event.timestamp);
          if (['task_started', 'item_completed'].includes(payload.type)) { baselineCandidate = payload.turn_id; baselineTerminal = false; }
          if (['task_started', 'item_completed'].includes(payload.type) && age >= 0 && age < 30000) { file.active = payload.turn_id; baselineActive = true; }
          if (['task_complete', 'turn_aborted'].includes(payload.type)) { file.active = null; baselineCandidate = null; baselineTerminal = true; }
          continue;
        }
        if (['task_started', 'item_completed'].includes(payload.type)) {
          if (file.active !== payload.turn_id) { baselineActive = false; file.active = payload.turn_id; this.emit('activity', { threadId: file.id, turnId: file.active, running: true, source: 'rollout', visualOnly: true }); }
        } else if (['task_complete', 'turn_aborted'].includes(payload.type) && file.active === payload.turn_id) {
          baselineTerminal = true; file.active = null; this.emit('activity', { threadId: file.id, turnId: payload.turn_id, running: false, completed: payload.type === 'task_complete', completedAt: Date.parse(event.timestamp) || undefined, source: 'rollout', visualOnly: true });
        }
      }
      if (baseline && baselineActive && file.active) this.emit('activity', { threadId: file.id, turnId: file.active, running: true, source: 'rollout', visualOnly: true, baseline: true });
      if (baseline && !file.active && (baselineCandidate || !baselineTerminal)) this.queueProbe(file);
    } finally { await handle.close(); }
  }
}
module.exports = { CodexActivity };
