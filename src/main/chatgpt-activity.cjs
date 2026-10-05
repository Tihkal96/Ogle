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
      observer = {epoch:${epoch}, sawWorking:false, submitted:false, pendingUntil:0, baseline:'', watch:null};
      const identity = () => {
        const all=document.querySelectorAll('[data-message-author-role="assistant"], [data-conversation-role="assistant"]');
        const last=all[all.length-1], turn=last?.closest('[data-turn-key], [data-testid^="conversation-turn-"], [data-message-id]');
        return turn?.getAttribute('data-turn-key') || turn?.getAttribute('data-message-id') || turn?.getAttribute('data-testid') || '';
      };
      const rememberSubmission=()=>{observer.submitted=true;observer.pendingUntil=Date.now()+15000;observer.baseline=identity();};
      const submitted = event => {
        const form = event.target.closest?.('form[data-chatgpt-composer]');
        if (form && event.isTrusted && form.querySelector('[role="textbox"][contenteditable="true"]')) rememberSubmission();
      };
      const clicked = event => {
        const button = event.target.closest?.('form[data-chatgpt-composer] button');
        if (!button || !event.isTrusted || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
        if (button.type === 'submit' || /^(send|po\u0161alji)(\\s|$)/i.test(button.getAttribute('aria-label') || '')) rememberSubmission();
      };
      document.addEventListener('submit', submitted, true);
      document.addEventListener('click', clicked, true);
      observer.dispose = () => {document.removeEventListener('submit', submitted, true); document.removeEventListener('click', clicked, true);};
      const relevant = '#composer-submit-button, form[data-chatgpt-composer], [data-is-streaming], .result-streaming, [aria-busy], button[data-testid*="stop"]';
      const composerControl = node => node.closest?.('#composer-submit-button') || (node.closest?.('button') && node.closest?.('form[data-chatgpt-composer]'));
      const identities='[data-turn-key], [data-message-id], [data-conversation-role], [data-message-author-role]';
      const match = node => node?.nodeType === 1 && (node.matches(relevant+','+identities) || node.querySelector(relevant+','+identities) || (node.closest('form[data-chatgpt-composer]') && (node.matches('button') || node.querySelector('button'))));
      observer.watch = new MutationObserver(records => {
        // Ignore streaming text nodes and ordinary message markup. Inspect only
        // small changed subtrees which can contain a lifecycle control/status.
        if (!records.some(record => record.type === 'attributes' ? (record.target.matches(relevant) || composerControl(record.target) || (['data-turn-key','data-message-id','data-conversation-role','data-message-author-role'].includes(record.attributeName) && record.target.matches(identities))) :
          (composerControl(record.target) || [...record.addedNodes, ...record.removedNodes].some(match)))) return;
        const state=probe();
        if(state.working){observer.sawWorking=true;observer.pendingUntil=0;}
        else if(observer.pendingUntil>Date.now() && state.latestAssistant && (state.complete || state.failed)){const current=identity();if(current && current!==observer.baseline){observer.sawWorking=true;observer.pendingUntil=0;}}
      });
      observer.watch.observe(document.documentElement, {subtree:true, childList:true, attributes:true,
        attributeFilter:['data-testid','aria-label','aria-busy','data-is-streaming','class','data-turn-key','data-message-id','data-conversation-role','data-message-author-role']});
      Object.defineProperty(window, key, {value:observer, configurable:true, writable:true});
    }
    const sample = ${ACTIVITY_PROBE};
    const sawWorking = observer.sawWorking;
    observer.sawWorking = false;
    const submitted=observer.submitted;observer.submitted=false;return {sample, sawWorking, submitted};
  })()`;
}

class ActivityTracker {
  constructor(emit = () => {}) { this.emit = emit; this.state = 'idle'; this.completionSamples = 0; this.completionArmed = false; this.generationConfirmed=false; }
  transition(state) { if (this.state !== state) { this.state = state; this.emit({ state }); } }
  pendingSubmission() {if(this.state==='working'&&this.generationConfirmed)return;this.completionSamples=0;this.completionArmed=false;this.generationConfirmed=false;this.transition('working');}
  reset() { this.generationConfirmed=false;this.completionSamples = 0; this.completionArmed = false; this.transition('idle'); }
  fail() { this.completionSamples = 0; if (this.state === 'working') this.transition('failed'); }
  sample(value) {
    if (!value || value.available !== true) return;
    if (value.working === true) {
      this.generationConfirmed=true;
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
    if (this.generationConfirmed && value.complete === true && (this.completionArmed ||
        (value.latestAssistant === true && value.composerReady === true))) {
      if (++this.completionSamples >= 2) { this.completionSamples = 0; this.transition('done'); }
    } else this.completionSamples = 0;
  }
}

const {AdaptivePoll}=require('./adaptive-poll.cjs');
class ChatGPTActivity {
  constructor(contents, onActivity = () => {}, interval = 900) {
    this.contents = contents;
    this.tracker = new ActivityTracker(event=>{this.poller?.context({working:event.state==='working'});onActivity(event);});
    this.epoch = 0; this.observationEpoch = 0; this.pending = false; this.disposed = false;
    this.unconfirmedSubmission=false;this.unconfirmedUntil=0;this.pendingTask=null;
    this.lastUrl = contents.getURL();
    this.navigate = (_event, url, inPlace, mainFrame) => {
      if (!mainFrame) return;
      // Sending a first prompt promotes / to /c/<id> without replacing the page.
      // Keep that observed generation; switching existing conversations resets it.
      let promotion = false;
      try { promotion = inPlace && new URL(this.lastUrl).origin === 'https://chatgpt.com' && new URL(url).origin === 'https://chatgpt.com' && new URL(this.lastUrl).pathname === '/' && /^\/c\/[^/]+$/.test(new URL(url).pathname); } catch {}
      this.lastUrl = url;
      if(!promotion)this.epoch++;
      if (!promotion) { this.unconfirmedSubmission=false;this.unconfirmedUntil=0;this.observationEpoch++; this.tracker.reset(); }
    };
    this.failed = (_event, code, _description, _url, mainFrame) => { if (mainFrame && code !== -3) { this.epoch++;this.unconfirmedSubmission=false;this.unconfirmedUntil=0;this.tracker.fail(); } };
    this.crashed = () => { this.epoch++; this.tracker.fail(); };
    this.loaded = () => this.poll();
    contents.on('did-finish-load', this.loaded);
    contents.on('did-start-navigation', this.navigate);
    contents.on('did-fail-load', this.failed);
    contents.on('render-process-gone', this.crashed);
    this.poller=new AdaptivePoll(()=>this.poll(),{activeMs:Math.max(250,interval)});
  }
  setVisible(visible) {this.poller.context({visible});}
  wake() {this.poller.wake();}
  poll(){if(this.pendingTask)return this.pendingTask;const task=this.collect();this.pendingTask=task;task.finally(()=>{if(this.pendingTask===task)this.pendingTask=null;}).catch(()=>{});return task;}
  async collect() {
    if (this.disposed || this.pending || this.contents.isDestroyed() || this.contents.isLoadingMainFrame()) return false;
    let host;
    try { host = new URL(this.contents.getURL()).hostname; } catch { return false; }
    if (host !== 'chatgpt.com') return false;
    const epoch = this.epoch; this.pending = true;
    try {
      const result = await this.contents.executeJavaScript(bufferedProbe(this.observationEpoch));
      if (!this.disposed && epoch === this.epoch && !this.contents.isDestroyed() && !this.contents.isLoadingMainFrame()) {
        const sample = result.sample;
        if(result.submitted && sample?.available && !sample.working && !result.sawWorking){this.tracker.pendingSubmission();if(!this.tracker.generationConfirmed){this.unconfirmedSubmission=true;this.unconfirmedUntil=Date.now()+15000;}}
        if(sample?.working || result.sawWorking){this.unconfirmedSubmission=false;this.unconfirmedUntil=0;}
        if(this.unconfirmedUntil && Date.now()>=this.unconfirmedUntil){this.unconfirmedUntil=0;this.tracker.reset();return sample?.available===true;}
        if (result.sawWorking && sample?.available && !sample.working) this.tracker.sample({...sample, working:true, complete:false});
        this.tracker.sample(sample);
        return sample?.available===true;
      }
      return false;
    } catch { /* A disappearing execution context is not a completion signal. */ return false; }
    finally { this.pending = false; }
  }
  dispose() {
    this.disposed = true; this.epoch++; this.poller.dispose();
    this.contents.removeListener('did-finish-load', this.loaded);
    this.contents.removeListener('did-start-navigation', this.navigate);
    this.contents.removeListener('did-fail-load', this.failed);
    this.contents.removeListener('render-process-gone', this.crashed);
    this.tracker.reset();
    if (this.contents.executeJavaScript && !this.contents.isDestroyed?.()) this.contents.executeJavaScript("window.__ogleChatGPTActivityObserver?.watch?.disconnect(); window.__ogleChatGPTActivityObserver?.dispose?.(); delete window.__ogleChatGPTActivityObserver; true").catch(()=>{});
  }
}
module.exports = { ACTIVITY_PROBE, bufferedProbe, ActivityTracker, ChatGPTActivity };
