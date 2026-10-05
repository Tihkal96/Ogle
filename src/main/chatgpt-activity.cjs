'use strict';
// These selectors are best-effort UI signals, not an official ChatGPT event API.
// The evaluated expression returns UI state only. It never reads message text.
const ACTIVITY_PROBE = `(() => {
  const available = location.hostname === 'chatgpt.com' && document.readyState === 'complete';
  if (!available) return {available:false,working:false,complete:false,failed:false};
  const visible = node => Boolean(node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none');
  const assistants = document.querySelectorAll('[data-message-author-role="assistant"], [data-conversation-role="assistant"]');
  const last = assistants[assistants.length - 1];
  const turn = last?.closest('[data-turn-key], article, [data-testid^="conversation-turn-"]') || last;
  const messages = document.querySelectorAll('[data-message-author-role], [data-conversation-role]');
  const latestAssistant = (messages[messages.length - 1]?.getAttribute('data-message-author-role') || messages[messages.length - 1]?.getAttribute('data-conversation-role')) === 'assistant';
  const stopSelector = 'button[data-testid="stop-button"], button[data-testid="composer-stop-button"], button[data-testid="stop-generating-button"], button[data-testid="stop-streaming-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"]';
  const stop = [...document.querySelectorAll(stopSelector)].some(visible);
  // Localized ChatGPT can keep a generic composer-submit id while changing
  // only its icon and translated accessible label. The stop glyph is a filled
  // square, scoped to that control so attachment/voice buttons cannot match.
  const composerForm = document.querySelector('form[data-chatgpt-composer][data-composer-placement="thread"]') || document.querySelector('form[data-chatgpt-composer]');
  const submit = document.querySelector('#composer-submit-button') || [...(composerForm?.querySelectorAll('button') || [])].find(button => /^(stop|zaustavi|arr\u00eater|anhalten|detener|interrompi)(\\s|$)/i.test(button.getAttribute('aria-label') || ''));
  const stopGlyph = visible(submit) && [...submit.querySelectorAll('svg rect')].some(rect => {
    const width = Number(rect.getAttribute('width')), height = Number(rect.getAttribute('height'));
    const fill = rect.getAttribute('fill');
    return width >= 8 && width <= 16 && width === height && fill !== 'none';
  });
  const streamSelector = '[data-is-streaming="true"], [data-testid="streaming-indicator"], .result-streaming';
  const streaming = Boolean(latestAssistant && turn &&
    (turn.matches(streamSelector + ', [aria-busy="true"]') || turn.querySelector(streamSelector)));
  const composerStopping = visible(submit) && /^(stop|zaustavi|arr\u00eater|anhalten|detener|interrompi)(\\s|$)/i.test(submit.getAttribute('aria-label') || '');
  const working = stop || stopGlyph || composerStopping || streaming;
  const finalActions = 'button[data-testid="copy-turn-action-button"], button[data-testid="good-response-turn-action-button"], button[data-testid="bad-response-turn-action-button"], button[aria-label="Ocijeni odgovor"], button[aria-label="Ponovno generiraj odgovor"], button[aria-label="Regenerate response"], button[aria-label="Rate response"]';
  const complete = Boolean(latestAssistant && turn && [...turn.querySelectorAll(finalActions)].some(visible));
  const composer = document.querySelector('#prompt-textarea, [data-testid="prompt-textarea"]') || composerForm?.querySelector('[role="textbox"][contenteditable="true"], textarea');
  const composerReady = visible(composer) && composer.getAttribute('contenteditable') !== 'false' && !composer.disabled;
  const failed = !working && Boolean(turn && [...turn.querySelectorAll('[data-testid="conversation-turn-error"], [data-testid="turn-error"]')].some(visible));
  return {available,working,complete,failed,latestAssistant,composerReady};
})()`;


// Keep only a boolean latch between polls. A response can start and finish in
// less than one polling interval, but its stop control still mutates the DOM.
function bufferedProbe(epoch) {
  return `(() => {
    const key = '__ogleChatGPTActivityObserver';
    let observer = window[key];
    if (!observer || observer.epoch !== ${epoch}) {
      observer?.watch?.disconnect();
      observer?.dispose?.();
      const probe = () => ${ACTIVITY_PROBE};
      observer = {epoch:${epoch}, sawWorking:false, watch:null};
      const submitted = event => {
        const form = event.target.closest?.('form[data-chatgpt-composer]');
        if (form && event.isTrusted && form.querySelector('[role="textbox"][contenteditable="true"]')) observer.sawWorking = true;
      };
      const clicked = event => {
        const button = event.target.closest?.('form[data-chatgpt-composer] button');
        if (!button || !event.isTrusted || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
        if (button.type === 'submit' || /^(send|po\u0161alji)(\\s|$)/i.test(button.getAttribute('aria-label') || '')) observer.sawWorking = true;
      };
      document.addEventListener('submit', submitted, true);
      document.addEventListener('click', clicked, true);
      observer.dispose = () => {document.removeEventListener('submit', submitted, true); document.removeEventListener('click', clicked, true);};
      const relevant = '#composer-submit-button, form[data-chatgpt-composer], [data-is-streaming], .result-streaming, [aria-busy], button[data-testid*="stop"]';
      const composerControl = node => node.closest?.('#composer-submit-button') || (node.closest?.('button') && node.closest?.('form[data-chatgpt-composer]'));
      const match = node => node?.nodeType === 1 && (node.matches(relevant) || node.querySelector(relevant) || (node.closest('form[data-chatgpt-composer]') && (node.matches('button') || node.querySelector('button'))));
      observer.watch = new MutationObserver(records => {
        // Ignore streaming text nodes and ordinary message markup. Inspect only
        // small changed subtrees which can contain a lifecycle control/status.
        if (!records.some(record => record.type === 'attributes' ? (record.target.matches(relevant) || composerControl(record.target)) :
          (composerControl(record.target) || [...record.addedNodes, ...record.removedNodes].some(match)))) return;
        if (probe().working) observer.sawWorking = true;
      });
      observer.watch.observe(document.documentElement, {subtree:true, childList:true, attributes:true,
        attributeFilter:['data-testid','aria-label','aria-busy','data-is-streaming','class']});
      Object.defineProperty(window, key, {value:observer, configurable:true, writable:true});
    }
    const sample = ${ACTIVITY_PROBE};
    const sawWorking = observer.sawWorking;
    observer.sawWorking = false;
    return {sample, sawWorking};
  })()`;
}

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
    // Modern ChatGPT keeps response actions mounted while streaming. The newest
    // message must be an assistant response and its composer must be ready; old
    // assistant buttons above a new user message are never completion evidence.
    if (value.complete === true && (this.completionArmed ||
        (value.latestAssistant === true && value.composerReady === true))) {
      if (++this.completionSamples >= 2) { this.completionSamples = 0; this.transition('done'); }
    } else this.completionSamples = 0;
  }
}

class ChatGPTActivity {
  constructor(contents, onActivity = () => {}, interval = 900) {
    this.contents = contents;
    this.tracker = new ActivityTracker(onActivity);
    this.epoch = 0; this.observationEpoch = 0; this.pending = false; this.disposed = false;
    this.lastUrl = contents.getURL();
    this.navigate = (_event, url, inPlace, mainFrame) => {
      if (!mainFrame) return;
      // Sending a first prompt promotes / to /c/<id> without replacing the page.
      // Keep that observed generation; switching existing conversations resets it.
      let promotion = false;
      try { promotion = inPlace && new URL(this.lastUrl).origin === 'https://chatgpt.com' && new URL(url).origin === 'https://chatgpt.com' && new URL(this.lastUrl).pathname === '/' && /^\/c\/[^/]+$/.test(new URL(url).pathname); } catch {}
      this.lastUrl = url;
      this.epoch++;
      if (!promotion) { this.observationEpoch++; this.tracker.reset(); }
    };
    this.failed = (_event, code, _description, _url, mainFrame) => { if (mainFrame && code !== -3) { this.epoch++; this.tracker.fail(); } };
    this.crashed = () => { this.epoch++; this.tracker.fail(); };
    this.loaded = () => this.poll();
    contents.on('did-finish-load', this.loaded);
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
      const result = await this.contents.executeJavaScript(bufferedProbe(this.observationEpoch));
      if (!this.disposed && epoch === this.epoch && !this.contents.isDestroyed() && !this.contents.isLoadingMainFrame()) {
        const sample = result.sample;
        if (result.sawWorking && sample?.available && !sample.working) this.tracker.sample({...sample, working:true, complete:false});
        this.tracker.sample(sample);
      }
    } catch { /* A disappearing execution context is not a completion signal. */ }
    finally { this.pending = false; }
  }
  dispose() {
    this.disposed = true; this.epoch++; clearInterval(this.timer);
    this.contents.removeListener('did-finish-load', this.loaded);
    this.contents.removeListener('did-start-navigation', this.navigate);
    this.contents.removeListener('did-fail-load', this.failed);
    this.contents.removeListener('render-process-gone', this.crashed);
    this.tracker.reset();
    if (this.contents.executeJavaScript && !this.contents.isDestroyed?.()) this.contents.executeJavaScript("window.__ogleChatGPTActivityObserver?.watch?.disconnect(); window.__ogleChatGPTActivityObserver?.dispose?.(); delete window.__ogleChatGPTActivityObserver; true").catch(()=>{});
  }
}
module.exports = { ACTIVITY_PROBE, bufferedProbe, ActivityTracker, ChatGPTActivity };
