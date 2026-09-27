'use strict';
const fs = require('node:fs');
const { ElevatedBroker } = require('./elevated-broker.cjs');
const { PersistentAdmin } = require('./persistent-admin.cjs');
const { PersistentAdminBroker } = require('./persistent-admin-broker.cjs');
const path = require('node:path');
const crypto = require('node:crypto');
function options(input = {}) {
  if (!['powershell', 'cmd'].includes(input.shell)) throw new Error('Select CMD or PowerShell.');
  const cwd = path.resolve(input.cwd || process.env.USERPROFILE || process.cwd());
  if (!fs.statSync(cwd).isDirectory()) throw new Error('Terminal folder does not exist.');
  return { shell: input.shell, cwd, admin: input.admin === true, cols: size(input.cols, 80), rows: size(input.rows, 24) };
}
function size(value, fallback) { return Number.isInteger(value) ? Math.max(2, Math.min(500, value)) : fallback; }
function startPty(config) {
  const pty = require('@lydell/node-pty');
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const executable = config.shell === 'cmd' ? path.join(systemRoot, 'System32/cmd.exe') : path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = { ...process.env, TERM: 'xterm-256color' };
  // An embedding runtime may point at its private PowerShell modules. Let the
  // system shell compute its own defaults instead of importing those modules.
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  return pty.spawn(executable, config.shell === 'cmd' ? ['/Q'] : ['-NoLogo'], { name: 'xterm-256color', cwd: config.cwd, cols: config.cols, rows: config.rows, env });
}
class TerminalManager {
  constructor({ onEvent = () => {}, executable = process.execPath, workerArgs = [], packaged = false, brokerFactory = (Broker, config) => new Broker(config) } = {}) { Object.assign(this, { onEvent, executable, workerArgs, brokerFactory }); this.sessions = new Map(); this.adminGeneration = 0; this.installation = new PersistentAdmin({ executable, packaged }); }
  async create(input) {
    const config = options(input), id = crypto.randomUUID();
    const session = { id, ...config }; this.sessions.set(id, session);
    try {
      if (config.admin) await this._elevate(session);
      else {
        session.pty = startPty(config);
        session.pty.onData(data => this._emit(id, 'data', { data }));
        session.pty.onExit(event => { this.sessions.delete(id); this._emit(id, 'exit', event); });
      }
      return { id, ...config };
    } catch (error) { this.close(id); throw error; }
  }
  _emit(id, event, extra = {}) { this.onEvent({ type: 'terminal', id, event, ...extra }); }
  async _elevate(session) {
    const generation = this.adminGeneration;
    // Standard accounts may consent with administrator credentials, but cannot
    // install a persistent elevated task for their own unprivileged identity.
    const persistent = this.broker ? null : await this.installation.canPersist();
    if (generation !== this.adminGeneration || !this.sessions.has(session.id)) throw new Error('Administrator shell startup was cancelled.');
    if (!this.broker) this.broker = this.brokerFactory(persistent ? PersistentAdminBroker : ElevatedBroker, { installation: this.installation, executable: this.executable, workerArgs: this.workerArgs, onEvent: event => {
      if (event.event === 'broker-closed') {
        for (const s of [...this.sessions.values()]) if (s.admin) { this.sessions.delete(s.id); this._emit(s.id, 'exit', { exitCode: null }); }
      } else if (event.id) {
        if (event.event === 'exit') this.sessions.delete(event.id);
        this._emit(event.id, event.event, { data: event.data, exitCode: event.exitCode });
      }
    }});
    return this.broker.create(session.id, { shell: session.shell, cwd: session.cwd, cols: session.cols, rows: session.rows });
  }
  releaseAdmin() { this.adminGeneration++; for (const session of [...this.sessions.values()]) if (session.admin) { this.close(session.id); this._emit(session.id,'exit',{exitCode:null}); } this.broker?.dispose(); this.broker = null; }
  adminStatus() { return this.installation.status(); }
  enableAdmin() { return this.installation.enable(); }
  async disableAdmin() { this.releaseAdmin(); return this.installation.disable(); }
  write(id, data) { const session = this.sessions.get(id); if (!session) throw new Error('Terminal is closed.'); if (typeof data !== 'string' || data.length > 1024 * 1024) throw new Error('Invalid terminal input.'); if (session.pty) session.pty.write(data); else this.broker.send({ event: 'write', id, data }); }
  resize(id, cols, rows) { const session = this.sessions.get(id); if (!session) return; cols = size(cols, 80); rows = size(rows, 24); if (session.pty) session.pty.resize(cols, rows); else this.broker.send({ event: 'resize', id, cols, rows }); }
  close(id) { const session = this.sessions.get(id); if (!session) return; this.sessions.delete(id); session.pty?.kill(); if (session.admin) { try { this.broker?.send({ event: 'close', id }); } catch {} } }
  dispose() { this.adminGeneration++; for (const id of [...this.sessions.keys()]) this.close(id); this.broker?.dispose(); }
}
module.exports = { TerminalManager, startPty, options };
