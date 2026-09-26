'use strict';
// These selectors are best-effort UI signals, not an official ChatGPT event API.
// The evaluated expression returns four booleans only. It never reads message text.
const ACTIVITY_PROBE = `(() => {
  const available = location.hostname === 'chatgpt.com' && document.readyState === 'complete';
  if (!available) return {available:false,working:false,complete:false,failed:false};
  const visible = node => Boolean(node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none');
  const assistants = document.querySelectorAll('[data-message-author-role="assistant"]');
  const last = assistants[assistants.length - 1];
  const turn = last?.closest('article, [data-testid^="conversation-turn-"]') || last;
  const stop = [...document.querySelectorAll('button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"]')].some(visible);
  const streaming = Boolean(last && (last.matches('[data-is-streaming="true"], .result-streaming') || last.querySelector('[data-is-streaming="true"], .result-streaming')));
  const working = stop || streaming;
  const complete = Boolean(turn && [...turn.querySelectorAll('button[data-testid="copy-turn-action-button"], button[data-testid="good-response-turn-action-button"], button[data-testid="bad-response-turn-action-button"]')].some(visible));
  const failed = !working && Boolean(turn && [...turn.querySelectorAll('[data-testid="conversation-turn-error"], [data-testid="turn-error"]')].some(visible));
  return {available,working,complete,failed};
})()`;

class ActivityTracker {
  constructor(emit = () => {}) { this.emit = emit; this.state = 'idle'; this.completionSamples = 0; this.completionArmed = false; }
  transition(state) { if (this.state !== state) { this.state = state; this.emit({ state }); } }
  reset() { this.completionSamples = 0; this.completionArmed = false; this.transition('idle'); }
  fail() { this.completionSamples = 0; if (this.state === 'working') this.transition('failed'); }
  sample(value) {
    if (!value || value.available !== true) return;
    if (value.working === true) {
      if (this.state !== 'working') this.completionArmed = value.complete !== true;
      else if (value.complete !== true) this.completionArmed = true;
      this.completionSamples = 0; this.transition('working'); return;
    }
    if (this.state !== 'working') return;
    if (value.failed === true) { this.fail(); return; }
    // Stop disappearing is insufficient. Require stable final action controls too.
    if (value.complete === true && this.completionArmed) {
      if (++this.completionSamples >= 2) { this.completionSamples = 0; this.transition('done'); }
    } else this.completionSamples = 0;
  }
}

class ChatGPTActivity {
  constructor(contents, onActivity = () => {}, interval = 900) {
    this.contents = contents;
    this.tracker = new ActivityTracker(onActivity);
    this.epoch = 0; this.pending = false; this.disposed = false;
    this.navigate = (_event, _url, _inPlace, mainFrame) => { if (mainFrame) { this.epoch++; this.tracker.reset(); } };
    this.failed = (_event, code, _description, _url, mainFrame) => { if (mainFrame && code !== -3) { this.epoch++; this.tracker.fail(); } };
    this.crashed = () => { this.epoch++; this.tracker.fail(); };
    contents.on('did-start-navigation', this.navigate);
    contents.on('did-fail-load', this.failed);
    contents.on('render-process-gone', this.crashed);
    this.timer = setInterval(() => this.poll(), Math.max(250, interval));
    this.timer.unref?.();
  }
  async poll() {
    if (this.disposed || this.pending || this.contents.isDestroyed() || this.contents.isLoadingMainFrame()) return;
    let host;
    try { host = new URL(this.contents.getURL()).hostname; } catch { return; }
    if (host !== 'chatgpt.com') return;
    const epoch = this.epoch; this.pending = true;
    try {
      const sample = await this.contents.executeJavaScript(ACTIVITY_PROBE);
      if (!this.disposed && epoch === this.epoch && !this.contents.isDestroyed() && !this.contents.isLoadingMainFrame()) this.tracker.sample(sample);
    } catch { /* A disappearing execution context is not a completion signal. */ }
    finally { this.pending = false; }
  }
  dispose() {
    this.disposed = true; this.epoch++; clearInterval(this.timer);
    this.contents.removeListener('did-start-navigation', this.navigate);
    this.contents.removeListener('did-fail-load', this.failed);
    this.contents.removeListener('render-process-gone', this.crashed);
    this.tracker.reset();
  }
}
module.exports = { ACTIVITY_PROBE, ActivityTracker, ChatGPTActivity };
