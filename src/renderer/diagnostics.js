'use strict';
window.OgleDiagnostics = (() => {
  const entries = [];
  let dialog, output, count;
  const redact = value => String(value)
    .replace(/(Bearer\s+)[\w.+\/-]+/gi, '$1[redacted]')
    .replace(/(["']?(?:access_token|refresh_token|password|api[_-]?key)["']?\s*[=:]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s&,;}\]]+)/gi, '$1[redacted]');
  function record(error, context = 'Ogle') {
    const detail = redact(error?.stack || error?.message || error).slice(0, 12000);
    const previous = entries.at(-1);
    if (previous?.detail === detail && previous.context === context) {
      previous.repeats++; previous.time = new Date().toISOString();
    } else {
      entries.push({ time: new Date().toISOString(), context, detail, repeats: 1 });
      if (entries.length > 200) entries.shift();
    }
    render();
  }
  function friendly(error) {
    const text = error?.message || String(error);
    if (/unsent draft|draft changed|message box changed/i.test(text)) return 'There’s already a draft in ChatGPT. Send or clear it there first.';
    if (/did not confirm|avoid a duplicate/i.test(text)) return 'Check ChatGPT before trying again—the message may have been sent.';
    if (/still replying|already has an active writer|send is already in progress/i.test(text)) return 'A reply is still in progress. Please wait before sending again.';
    if (/chatgpt/i.test(text)) return 'ChatGPT needs attention. Open its tab to check your draft and sign-in.';
    if (/binary or UTF-16|not valid UTF-8|invalid UTF-8/i.test(text)) return 'Open a UTF-8 text file. Convert its encoding in another editor first if needed.';
    if (/text files? (?:smaller than|up to) 5 MB/i.test(text)) return 'The editor supports text files up to 5 MB. Open a smaller file or shorten the text.';
    if (/file.*changed (?:on disk|outside)|file.*modified (?:on disk|outside)/i.test(text)) return 'The file changed outside Ogle. Review the current file, or use Save As to keep your edits separately.';
    if (/\bEACCES\b|\bEPERM\b|permission denied|access is denied/i.test(text) || ['EACCES','EPERM'].includes(error?.code)) return 'You don’t have permission to access this file or folder. Check its permissions, or save to a folder you can write to.';
    if (!/\bspawn\b/i.test(text) && (/\bENOENT\b.*(?:no such file|open|stat|scandir|readdir)|file (?:was )?not found|file.*does not exist/i.test(text) || error?.code === 'ENOENT')) return 'The file or folder was not found. Check whether it was moved or deleted, then choose it again.';
    if (/codex|ENOENT.*codex|not connected/i.test(text)) return 'Codex isn’t available. Open it and sign in to use this feature.';
    if (/Saving is taking too long/i.test(text)) return 'Saving is taking longer than expected. Ogle stayed open; wait a moment and try closing again.';
    if (/auto-collapse delay/i.test(text)) return 'Choose a delay from 1 to 120 seconds.';
    return 'Couldn’t complete that action. Details are in Settings → Debug.';
  }
  function render() {
    if (!dialog?.open) return;
    count.textContent = `${entries.length} entries · current session only`;
    output.value = entries.length ? entries.map(item => `[${item.time}] ${item.context}${item.repeats > 1 ? ` (×${item.repeats})` : ''}\n${item.detail}`).join('\n\n') : 'No diagnostic messages in this session.';
  }
  function open() {
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'debug-log'; dialog.setAttribute('aria-labelledby', 'debug-title');
      const title = document.createElement('h2'); title.id = 'debug-title'; title.textContent = 'Debug log';
      const hint = document.createElement('p'); hint.textContent = 'Technical diagnostics for troubleshooting. Nothing is uploaded automatically. Review before sharing.';
      count = document.createElement('p');
      output = document.createElement('textarea'); output.readOnly = true; output.setAttribute('aria-label', 'Technical diagnostics'); output.spellcheck = false;
      const actions = document.createElement('div'); actions.className = 'settings-actions';
      const button = (label, action) => { const node = document.createElement('button'); node.textContent = label; node.type = 'button'; node.onclick = action; actions.append(node); };
      button('Copy log', async () => { try { await navigator.clipboard.writeText(output.value); count.textContent = 'Copied to clipboard.'; } catch (error) { record(error, 'Copy debug log'); count.textContent = 'Select the log and press Ctrl+C to copy.'; } });
      button('Clear log', () => { entries.length = 0; render(); });
      button('Close', () => dialog.close());
      dialog.append(title, hint, count, output, actions); document.body.append(dialog);
    }
    if (!dialog.open) dialog.showModal();
    render();
  }
  window.addEventListener('error', event => record(event.error || event.message, 'Renderer'));
  window.addEventListener('unhandledrejection', event => record(event.reason, 'Unhandled promise'));
  return { record, friendly, open };
})();
