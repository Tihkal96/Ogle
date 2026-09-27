'use strict';
const { WebContentsView, shell, dialog, session } = require('electron');
const { isHttps } = require('../chatgpt/navigation.cjs');
const { ChatGPTActivity } = require('./chatgpt-activity.cjs');
const HOME = 'https://chatgpt.com/';

class ChatGPTPanel {
  constructor({ parent, onStatus, onActivity, onInteraction, onFindOpen, onFindResult } = {}) {
    this.parent = parent;
    this.onStatus = onStatus;
    this.onActivity = onActivity;
    this.onInteraction = onInteraction;
    this.onFindOpen = onFindOpen;
    this.onFindResult = onFindResult;
    this.activity = null;
    this.view = null;
    this.children = new Set();
    this.visible = false;
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    this.status = { message: 'ChatGPT is ready to open.', failed: false };
    this.resize = () => this.applyLayout();
    parent?.on('resize', this.resize);
    parent?.once('closed', () => this.close());
  }

  setStatus(message, failed = false) {
    this.status = { message, failed };
    this.onStatus?.(this.status);
    this.applyLayout();
  }

  allowClipboardWrite(contents, permission, requestingUrl, details = {}) {
    if (permission !== 'clipboard-sanitized-write' || contents !== this.view?.webContents ||
        !contents || contents.isDestroyed() || !this.visible || !this.view.getVisible() ||
        !this.parent?.isFocused() || !contents.isFocused() || details.isMainFrame !== true) return false;
    try {
      return new URL(contents.getURL()).origin === 'https://chatgpt.com' &&
        new URL(requestingUrl).origin === 'https://chatgpt.com';
    } catch { return false; }
  }

  secure(contents) {
    const guard = (event, url) => { if (!isHttps(url)) event.preventDefault(); };
    contents.on('will-navigate', guard);
    contents.on('will-redirect', guard);
    contents.setWindowOpenHandler(({ url }) => {
      if (!isHttps(url)) return { action: 'deny' };
      const host = new URL(url).hostname;
      const authHost = ['auth.openai.com', 'auth0.openai.com', 'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com', 'login.live.com'].includes(host);
      if (!authHost) {
        if (host === 'chatgpt.com') contents.loadURL(url).catch(() => {});
        else shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
      }
      return { action: 'allow', overrideBrowserWindowOptions: {
        width: 620, height: 740, autoHideMenuBar: true,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, partition: 'persist:petdock-chatgpt', preload: undefined }
      } };
    });
    contents.on('did-create-window', child => {
      this.children.add(child);
      this.secure(child.webContents);
      child.on('closed', () => this.children.delete(child));
    });
    contents.on('will-attach-webview', event => event.preventDefault());
  }

  ensureView() {
    if (this.view && !this.view.webContents.isDestroyed()) return false;
    if (!this.parent || this.parent.isDestroyed()) throw new Error('The dock window is closed.');
    this.view = new WebContentsView({ webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, partition: 'persist:petdock-chatgpt'
    } });
    const contents = this.view.webContents;
    // Native child-view input never bubbles into the dock renderer. Send only
    // an activity signal, never keys, text, pointer coordinates or page content.
    let lastMouseMove = 0;
    const interact = () => {
      if (this.visible && this.view?.getVisible()) this.onInteraction?.();
    };
    contents.on('before-input-event', (event, input) => {
      interact();
      if (input.type === 'keyDown' && input.control && !input.alt && !input.meta &&
          String(input.key).toLowerCase() === 'f' && this.visible && this.view?.getVisible()) {
        event.preventDefault();
        this.parent.webContents.focus();
        this.onFindOpen?.();
      }
    });
    contents.on('found-in-page', (_event, result) => {
      if (this.visible && this.view?.getVisible()) this.onFindResult?.(result);
    });
    contents.on('before-mouse-event', (_event, input) => {
      if (input.type === 'mouseMove') {
        const now = Date.now();
        if (now - lastMouseMove < 100) return;
        lastMouseMove = now;
      }
      interact();
    });
    this.activity?.dispose();
    this.activity = new ChatGPTActivity(contents, this.onActivity);
    // Keep the original partition so the existing login stays intact.
    contents.session.setPermissionRequestHandler((sender, permission, callback, details) =>
      callback(this.allowClipboardWrite(sender, permission, details.requestingUrl, details)));
    contents.session.setPermissionCheckHandler((sender, permission, requestingOrigin, details) =>
      this.allowClipboardWrite(sender, permission, requestingOrigin, details));
    this.secure(contents);
    this.parent.contentView.addChildView(this.view);
    contents.on('did-start-loading', () => this.setStatus('Loading ChatGPT…'));
    contents.on('did-stop-loading', () => {
      if (!this.status.failed) this.setStatus('Use ChatGPT’s sidebar for past chats. Complete any sign-in or website check here.');
    });
    contents.on('did-finish-load', () => this.setStatus('Use ChatGPT’s sidebar for past chats. Sign in here if asked.'));
    contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      this.setStatus(`ChatGPT could not load (${description}). Reload or open it in your browser.`, true);
    });
    contents.on('render-process-gone', () => this.setStatus('The ChatGPT page stopped. Reload to recover, or open your browser.', true));
    this.applyLayout();
    return true;
  }

  layout({ visible = this.visible, bounds = this.bounds } = {}) {
    if (visible !== true) this.stopFind();
    this.visible = visible === true;
    if (bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key]))) {
      this.bounds = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(bounds[key])]));
    }
    this.applyLayout();
  }

  find(query, options = {}) {
    if (typeof query !== 'string' || query.length > 500) throw new Error('Invalid search text.');
    const keys = ['forward', 'findNext', 'matchCase'];
    if (!options || typeof options !== 'object' || Array.isArray(options) ||
        Object.keys(options).some(key => !keys.includes(key) || typeof options[key] !== 'boolean')) {
      throw new Error('Invalid search options.');
    }
    if (!query) { this.stopFind(); return null; }
    const contents = this.view?.webContents;
    if (!contents || contents.isDestroyed() || !this.visible || !this.view.getVisible()) return null;
    if (!options.findNext) contents.stopFindInPage('clearSelection');
    // Our UI uses findNext for navigating existing results. Electron's native
    // flag has the opposite contract: true starts a session, false continues it.
    return contents.findInPage(query, { forward: true, matchCase: false, ...options, findNext: !options.findNext });
  }

  stopFind() {
    const contents = this.view?.webContents;
    if (contents && !contents.isDestroyed()) contents.stopFindInPage('clearSelection');
  }

  applyLayout() {
    if (!this.view || this.view.webContents.isDestroyed() || !this.parent || this.parent.isDestroyed()) return;
    const [width, height] = this.parent.getContentSize();
    const x = Math.max(0, Math.min(width, this.bounds.x));
    const y = Math.max(0, Math.min(height, this.bounds.y));
    const next = { x, y, width: Math.max(0, Math.min(width - x, this.bounds.width)), height: Math.max(0, Math.min(height - y, this.bounds.height)) };
    this.view.setBounds(next);
    this.view.setVisible(this.visible && !this.status.failed && next.width > 0 && next.height > 0);
  }

  async show(action = 'show') {
    if(action==='logout') {
      const choice=await dialog.showMessageBox(this.parent,{type:'question',message:'Sign out of ChatGPT in Ogle?',detail:'This clears only the dock’s ChatGPT browser session.',buttons:['Cancel','Sign out'],defaultId:0,cancelId:0});
      if(choice.response!==1)return {cancelled:true};
      const wasVisible=this.visible;
      for(const child of this.children)if(!child.isDestroyed())child.destroy();
      this.children.clear();
      if(this.view)await this.view.webContents.loadURL('about:blank');
      await session.fromPartition('persist:petdock-chatgpt').clearStorageData();
      this.visible=wasVisible;this.ensureView();await this.loadHome();return;
    }
    if(action==='bottom') {
      if(this.view&&!this.view.webContents.isDestroyed())await this.view.webContents.executeJavaScript(`(() => {
        const last = [...document.querySelectorAll('main [data-message-id], main article, [data-testid^="conversation-turn-"]')].pop();
        if(last)last.scrollIntoView({block:'end',behavior:'smooth'});
        for(let node=last?.parentElement || document.querySelector('main');node;node=node.parentElement)if(node.scrollHeight>node.clientHeight+100 && ['auto','scroll'].includes(getComputedStyle(node).overflowY))node.scrollTo({top:node.scrollHeight,behavior:'smooth'});
        window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
      })()`);
      return;
    }
    if (action === 'close' || action === 'hide') { this.hide(); return; }
    if (action === 'external') { await this.openExternal(); return; }
    this.visible = true;
    const created = this.ensureView();
    this.applyLayout();
    if (created || action === 'new') { await this.loadHome(); return; }
    const contents = this.view.webContents;
    if (action === 'reload') { this.setStatus('Loading ChatGPT…'); contents.reload(); }
    else if (action === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
  }

  async loadHome() {
    if (!this.view) return;
    this.setStatus('Loading ChatGPT…');
    try { await this.view.webContents.loadURL(HOME); }
    catch (error) {
      if (error.code === 'ERR_ABORTED') return;
      this.setStatus('ChatGPT could not load. Reload or open it in your browser.', true);
    }
  }

  async openExternal() {
    const url = this.view?.webContents.getURL();
    let target = HOME;
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'chatgpt.com' && isHttps(url) && /^\/c\/[a-zA-Z0-9-]+$/.test(parsed.pathname)) target = `${parsed.origin}${parsed.pathname}`;
    } catch {}
    await shell.openExternal(target);
  }

  hide() { this.stopFind(); this.visible = false; this.applyLayout(); }

  close() {
    this.activity?.dispose(); this.activity = null;
    this.visible = false;
    for (const child of this.children) if (!child.isDestroyed()) child.destroy();
    this.children.clear();
    if (this.view) {
      if (this.parent && !this.parent.isDestroyed()) this.parent.contentView.removeChildView(this.view);
      if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
      this.view = null;
    }
    this.parent?.removeListener('resize', this.resize);
  }
}
module.exports = { ChatGPTPanel };
