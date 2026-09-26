'use strict';

const pending = new WeakSet();
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function validateChatGPTPayload(payload) {
  if (!payload || typeof payload.text !== 'string' || payload.text.length > 100000) throw new Error('ChatGPT prompt must be text of at most 100,000 characters.');
  const attachments = payload.attachments ?? [];
  if (!Array.isArray(attachments) || attachments.length > 4) throw new Error('ChatGPT accepts at most four attachments from the bar.');
  let total = 0;
  const files = attachments.map((item, index) => {
    if (!item || !['file', 'image'].includes(item.type) || typeof item.url !== 'string' || item.url.length > MAX_FILE_BYTES * 1.4) throw new Error('Invalid ChatGPT attachment.');
    const match = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(item.url);
    if (!match || match[2].length % 4 !== 0) throw new Error('ChatGPT attachments must be base64 file data.');
    const bytes = Buffer.from(match[2], 'base64').length;
    total += bytes;
    if (!bytes || bytes > MAX_FILE_BYTES || total > 16 * 1024 * 1024) throw new Error('Attachments must be at most 8 MB each and 16 MB together.');
    const name = typeof item.name === 'string' ? item.name.trim() : `image-${index + 1}.png`;
    if (!name || name.length > 255 || /[\x00-\x1f/\\]/.test(name)) throw new Error('Invalid attachment filename.');
    return { name, mimeType: match[1], base64: match[2] };
  });
  if (!payload.text.trim() && !files.length) throw new Error('Enter a prompt or attach a file.');
  return { text: payload.text, files };
}

// Executed only in the embedded ChatGPT page. It does not read account data,
// navigate, retry a send, or replace an existing website composer draft.
async function composeInPage(payload) {
  const fail = message => { throw new Error(message); };
  if (location.origin !== 'https://chatgpt.com') fail('Open ChatGPT and finish signing in before sending.');
  const visible = element => element && element.getClientRects().length > 0;
  const first = selector => [...document.querySelectorAll(selector)].find(visible);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const busy = () => first('[data-testid="stop-button"],button[aria-label="Stop streaming"],button[aria-label="Stop generating"]');
  const editorSelector = '#prompt-textarea,textarea[data-testid="prompt-textarea"],textarea[placeholder*="Message"],[contenteditable="true"][data-placeholder],form [contenteditable="true"][role="textbox"],form .ProseMirror[contenteditable="true"],[data-testid="composer"] [contenteditable="true"],[data-testid="composer"] textarea,form[data-type="unified-composer"] textarea';
  // did-finish-load precedes the website's React hydration. Wait for an actual
  // editable composer to settle instead of treating a loading shell as logout.
  let editor, previousEditor, stableSamples = 0, loginSince = 0;
  for (let attempt = 0; attempt < 75; attempt++) {
    if (location.origin !== 'https://chatgpt.com') fail('ChatGPT opened a sign-in page. Finish signing in before sending.');
    if (busy()) fail('ChatGPT is still replying. Wait for it to finish before sending.');
    const candidate = [...document.querySelectorAll(editorSelector)].find(node => visible(node) && !node.disabled && !node.readOnly && (node.tagName === 'TEXTAREA' || node.isContentEditable));
    const login = first('[data-testid="login-button"]');
    // Guest ChatGPT can show Log in next to a fully usable composer.
    if (login && !candidate) {
      loginSince ||= Date.now();
      if (Date.now() - loginSince >= 2000) fail('ChatGPT appears signed out. Sign in in the ChatGPT tab, then send your saved bar draft.');
    } else loginSince = 0;
    if (candidate) {
      stableSamples = candidate === previousEditor ? stableSamples + 1 : 1;
      if (stableSamples >= 2) { editor = candidate; break; }
    } else stableSamples = 0;
    previousEditor = candidate;
    await pause(200);
  }
  if (!editor) {
    if (document.readyState !== 'complete' || first('[aria-busy="true"],[role="progressbar"]')) fail('ChatGPT is still loading its message box. Your draft is saved; try again when the tab is ready.');
    const editableCount = [...document.querySelectorAll('textarea,[contenteditable="true"]')].filter(visible).length;
    const matchedCount = [...document.querySelectorAll(editorSelector)].filter(visible).length;
    fail(`ChatGPT’s message box could not be found after waiting (visible editors: ${editableCount}, matched: ${matchedCount}). Open its tab to finish any website check or use the website composer; your bar draft is saved.`);
  }
  if (busy()) fail('ChatGPT is still replying. Wait for it to finish before sending.');
  const textOf = () => 'value' in editor ? editor.value : editor.innerText;
  const normalizeText = value => value.replace(/\r\n/g, '\n').trim();
  // Historical messages can contain the same attachment components. Only the
  // composer owns pending files; history must not prevent a new message.
  let composer = editor.closest('form,[data-testid="composer"],[data-type="unified-composer"],#composer-background');
  if (!composer) {
    for (let container = editor.parentElement; container && container !== document.body; container = container.parentElement) {
      if (container.querySelector('#composer-submit-button,[data-testid="send-button"]')) { composer = container; break; }
    }
  }
  composer ||= editor.parentElement?.parentElement;
  if (!composer) fail('ChatGPT changed its message box. Enter the prompt in the ChatGPT tab.');
  const attachmentNodes = () => [...composer.querySelectorAll('[data-testid*="attachment"],[data-testid*="file-thumbnail"],button[aria-label^="Remove file"],button[aria-label^="Remove attachment"]')].filter(visible);
  // A failed readiness check leaves the bar's exact text in the website. An
  // explicit retry may send that same text without appending or overwriting it.
  const reuseTextDraft = !payload.files.length && !attachmentNodes().length && normalizeText(payload.text) !== '' && normalizeText(textOf()) === normalizeText(payload.text);
  if (!reuseTextDraft && (textOf().trim() || attachmentNodes().length)) fail('ChatGPT already has an unsent draft or attachment. Send or clear it in the ChatGPT tab first.');
  const originalURL = location.href;
  const samePage = () => { if (location.href !== originalURL || !editor.isConnected) fail('ChatGPT changed pages. Check the ChatGPT tab before sending again.'); };
  const sendCandidates = () => [...composer.querySelectorAll('#composer-submit-button,[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Send message"],button[aria-label="Send"],button[aria-label="Pošalji"],button[aria-label="Pošalji upit"],button[type="submit"]')].filter(node => {
    if (!visible(node) || node.tagName !== 'BUTTON') return false;
    // Submit is a language-independent fallback scoped to this composer only.
    // Never use a voice, attachment, or stop control as the send action.
    return !/(?:stop|voice|dictat|attach|upload|record|microphone)/i.test(`${node.id} ${node.getAttribute('data-testid') || ''} ${node.getAttribute('aria-label') || ''}`);
  });
  const enabled = button => !button.disabled && button.getAttribute('aria-disabled') !== 'true';
  editor.focus();
  if (payload.files.length) {
    const transfer = new DataTransfer();
    for (const file of payload.files) {
      const binary = atob(file.base64), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      transfer.items.add(new File([bytes], file.name, { type: file.mimeType }));
    }
    // The website's real upload handler owns transfer and validation. A file
    // input accepts documents too; paste is the fallback for image-only UIs.
    const input = [...composer.querySelectorAll('input[type="file"]')].find(node => !node.disabled && (node.multiple || transfer.files.length === 1));
    if (input) {
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }
    let accepted = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      samePage();
      const namesVisible = payload.files.every(file => composer.innerText.includes(file.name) || [...composer.querySelectorAll('[title],[aria-label],[alt]')].some(node => `${node.title} ${node.getAttribute('aria-label')} ${node.getAttribute('alt')}`.includes(file.name)));
      if (namesVisible && !composer.querySelector('[role="progressbar"],[aria-busy="true"]')) { accepted = true; break; }
      await pause(200);
    }
    if (!accepted) fail('ChatGPT did not confirm the attachments. Review the ChatGPT tab and attach/send there; nothing was sent automatically.');
  }
  samePage();
  if (reuseTextDraft ? normalizeText(textOf()) !== normalizeText(payload.text) : textOf().trim()) fail('The ChatGPT message box changed while preparing attachments. Review its draft before sending.');
  if (payload.text && !reuseTextDraft) {
    if ('value' in editor) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!setter) fail('ChatGPT changed its message box. Enter the prompt in the ChatGPT tab.');
      setter.call(editor, payload.text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Browser editing keeps ProseMirror/React's internal document in sync.
      if (!document.execCommand('insertText', false, payload.text)) fail('ChatGPT could not accept the prompt. Enter it in the ChatGPT tab.');
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: payload.text }));
    }
    if (textOf().replace(/\r\n/g, '\n').trim() !== payload.text.replace(/\r\n/g, '\n').trim()) fail('ChatGPT did not accept the entire prompt. Review its message box before sending.');
  }
  let button;
  for (let attempt = 0; attempt < 15; attempt++) {
    samePage();
    if (busy()) fail('ChatGPT started replying. Review the tab before sending.');
    button = sendCandidates().find(enabled);
    if (button) break;
    button = null;
    await pause(200);
  }
  if (!button) {
    const candidates = sendCandidates();
    const detail = candidates.length ? `${candidates.length} send control(s), ${candidates.filter(node => !enabled(node)).length} disabled` : 'no supported send control found';
    fail(`ChatGPT is not ready to send (${detail}). The prompt is in its message box; review attachments or website errors there.`);
  }
  if (normalizeText(textOf()) !== normalizeText(payload.text)) fail('The ChatGPT draft changed before sending. Review its message box; nothing was sent automatically.');
  button.click(); // Exactly one click. Never retry an uncertain send.
  for (let attempt = 0; attempt < 40; attempt++) {
    await pause(100);
    if (busy() || (editor.isConnected && !textOf().trim() && (!payload.files.length || !attachmentNodes().length))) return { sent: true };
  }
  fail('The send was clicked, but ChatGPT did not confirm it. Check the ChatGPT tab before trying again to avoid a duplicate.');
}

async function sendChatGPT(contents, payload) {
  const validated = validateChatGPTPayload(payload);
  if (!contents || contents.isDestroyed()) throw new Error('Open the ChatGPT tab before sending.');
  let url;
  try { url = new URL(contents.getURL()); } catch {}
  if (url?.origin !== 'https://chatgpt.com' || contents.isLoadingMainFrame()) throw new Error('Wait for ChatGPT to load and finish signing in before sending.');
  if (pending.has(contents)) throw new Error('A ChatGPT send is already in progress.');
  pending.add(contents);
  try { return await contents.executeJavaScript(`(${composeInPage.toString()})(${JSON.stringify(validated)})`, true); }
  finally { pending.delete(contents); }
}

module.exports = { sendChatGPT, validateChatGPTPayload };
