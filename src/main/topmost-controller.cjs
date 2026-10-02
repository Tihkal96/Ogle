'use strict';
const { createFullscreenMonitor } = require('./fullscreen-monitor.cjs');

// Windows keeps topmost windows in a separate z-order band; another topmost
// window can still cover us. Restore our band/order after native transitions,
// without activating Ogle. A low-frequency visible-only guard also handles a
// different application entering the topmost band after Ogle already lost focus.
class TopmostController {
  constructor(window, { enabled = true, children = () => [], setTimer = setTimeout, clearTimer = clearTimeout, setGuard = setInterval, clearGuard = clearInterval, monitor = createFullscreenMonitor } = {}) {
    Object.assign(this, { window, enabled: !!enabled, children, setTimer, clearTimer, setGuard, clearGuard });
    this.timers = new Set();
    this.listeners = [];
    this.suspended = false;
    this.disposed = false;
    this.fullscreen = undefined;
    for (const event of ['show', 'restore', 'blur', 'enter-full-screen', 'leave-full-screen']) {
      const listener = () => this.request();
      window.on(event, listener); this.listeners.push([event, listener]);
    }
    for (const event of ['hide', 'minimize']) {
      const listener = () => { this.cancel(); this.stopGuard(); };
      window.on(event, listener); this.listeners.push([event, listener]);
    }
    this.closed = () => this.dispose();
    window.once('closed', this.closed);
    this.monitor = monitor(active => this.setFullscreen(active));
    this.setEnabled(enabled);
  }
  windows() {
    return [this.window, ...this.children()].filter(window => window && !window.isDestroyed());
  }
  cancel() {
    for (const timer of this.timers) this.clearTimer(timer);
    this.timers.clear();
  }
  stopGuard() {
    if (this.guard !== undefined) this.clearGuard(this.guard);
    this.guard = undefined;
  }
  startGuard() {
    if (this.guard !== undefined || this.disposed || !this.enabled || this.suspended ||
        this.window.isDestroyed() || !this.window.isVisible() || this.window.isMinimized()) return;
    this.guard = this.setGuard(() => this.reassert(), 2000);
    this.guard?.unref?.();
  }
  setEnabled(enabled) {
    this.enabled = !!enabled;
    this.cancel(); this.stopGuard();
    for (const window of this.windows()) window.setAlwaysOnTop(this.enabled && this.fullscreen !== undefined && !this.fullscreen, 'floating');
    if (this.enabled) this.request();
  }
  setFullscreen(active) {
    if (this.disposed || this.fullscreen === active) return;
    this.fullscreen = active;
    this.cancel();
    // Keep the normal recovery guard alive, but never raise into fullscreen.
    // Lower once on entry, then restore without focus when fullscreen ends.
    for (const window of this.windows()) window.setAlwaysOnTop(this.enabled && this.fullscreen !== undefined && !this.fullscreen, 'floating');
    if (this.fullscreen === false) this.request();
  }
  setSuspended(suspended) {
    this.suspended = !!suspended;
    this.cancel(); this.stopGuard();
    if (!this.suspended) this.request();
  }
  request() {
    if (this.disposed || !this.enabled || this.suspended || this.fullscreen !== false) return;
    this.cancel(); this.startGuard();
    // One bounded burst covers the asynchronous Windows activation/restore
    // transition. The separate two-second guard never calls focus()/show().
    for (const delay of [80, 300, 900]) {
      const timer = this.setTimer(() => { this.timers.delete(timer); this.reassert(); }, delay);
      timer?.unref?.(); this.timers.add(timer);
    }
  }
  reassert() {
    if (this.disposed || !this.enabled || this.suspended || this.fullscreen !== false || this.window.isDestroyed() ||
        !this.window.isVisible() || this.window.isMinimized()) return;
    for (const window of this.windows()) {
      if (!window.isVisible() || window.isMinimized()) continue;
      window.setAlwaysOnTop(true, 'floating');
      // Electron documents moveTop as changing z-order regardless of focus.
      // Owned authentication windows follow their parent, never underneath it.
      window.moveTop();
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.cancel(); this.stopGuard(); this.monitor?.dispose();
    for (const [event, listener] of this.listeners) this.window.removeListener(event, listener);
    this.window.removeListener('closed', this.closed);
    this.listeners = [];
  }
}
module.exports = { TopmostController };
