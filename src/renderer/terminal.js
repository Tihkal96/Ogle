(() => {
  let api, host, active, sessions = new Map(), pending = new Map();
  let currentTheme = document.documentElement.dataset.theme || 'dark';
  function terminalTheme(theme) {
    const light=theme==='light', midnight=theme==='midnight';
    return {background:light?'#ffffff':midnight?'#0c1725':'#111315',foreground:light?'#171a1d':'#e4e7ea',cursor:light?'#171a1d':'#e4e7ea',selectionBackground:light?'#c9d8eb':'#36506b',black:light?'#252a30':'#333a42',brightBlack:light?'#59636e':'#909aa5',red:light?'#a62525':'#e68181',green:light?'#237238':'#8bbc93',yellow:light?'#805b00':'#d2ba77',blue:light?'#2455a3':'#87acd6',magenta:light?'#805395':'#b89dc8',cyan:light?'#14717b':'#7ebdc4',white:light?'#d6dbe1':'#dce1e7',brightWhite:light?'#ffffff':'#ffffff'};
  }
  function applyTheme(theme) {currentTheme=theme;for(const s of sessions.values()){s.term.options.theme=terminalTheme(theme);s.term.refresh(0,s.term.rows-1);}}
  const element = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
  function report(error) { window.OgleDiagnostics.record(error,'Terminal');host.querySelector('.terminal-status').textContent='Terminal action failed. Details are in Settings → Debug.'; }
  function resize() { const session = sessions.get(active); if (session && host.getBoundingClientRect().width > 0 && host.getBoundingClientRect().height > 0) { try { session.fit.fit(); api.terminalResize(session.id, session.term.cols, session.term.rows).catch(() => {}); } catch {} } }
  function select(id) { active = id; for (const session of sessions.values()) { session.view.hidden = session.id !== id; session.tab.classList.toggle('active', session.id === id); } requestAnimationFrame(() => { resize(); sessions.get(id)?.term.focus(); }); }
  async function create(shell, admin = false) {
    const status = host.querySelector('.terminal-status'); status.textContent = admin ? 'Starting administrator terminal (Windows approval if needed)…' : 'Starting terminal…';
    try {
      const cwd = host.querySelector('.terminal-cwd').value.trim();
      const config = await api.terminalCreate({ shell, admin, cwd: cwd || undefined, cols: 80, rows: 20 });
      const term = new window.PetDockVendors.Terminal({ cursorBlink: true, fontSize: 12, scrollback: 5000, fontFamily: '"Cascadia Mono", Consolas, monospace', theme: terminalTheme(currentTheme) });
      const fit = new window.PetDockVendors.FitAddon(); term.loadAddon(fit);
      const view = element('div', '', 'terminal-session'); host.querySelector('.terminal-views').append(view); term.open(view);
      const tab = element('button', `${admin ? 'ADMIN · ' : ''}${shell === 'cmd' ? 'CMD' : 'PowerShell'}`); tab.type = 'button'; tab.onclick = () => select(config.id); host.querySelector('.terminal-tabs').append(tab);
      // Select locally in xterm's rendered buffer; Shift+arrows must not reach the shell.
      let keyboardSelection;
      view.addEventListener('pointerdown', () => { keyboardSelection = null; });
      term.onResize(() => { keyboardSelection = null; });
      term.attachCustomKeyEventHandler(event => {
        const selectionKey = event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key);
        if (selectionKey) {
          event.preventDefault();
          if (event.type === 'keydown') {
            const buffer = term.buffer.active, cols = term.cols;
            if (!term.hasSelection()) keyboardSelection = null;
            if (!keyboardSelection) {
              const range = term.getSelectionPosition();
              const cursor = (buffer.baseY + buffer.cursorY) * cols + buffer.cursorX;
              keyboardSelection = range ? {anchor:range.start.y * cols + range.start.x,head:range.end.y * cols + range.end.x} : {anchor:cursor,head:cursor};
            }
            const delta = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-cols,ArrowDown:cols}[event.key];
            keyboardSelection.head = Math.max(0,Math.min(buffer.length * cols,keyboardSelection.head + delta));
            const start = Math.min(keyboardSelection.anchor,keyboardSelection.head), end = Math.max(keyboardSelection.anchor,keyboardSelection.head);
            if (start === end) term.clearSelection(); else term.select(start % cols,Math.floor(start / cols),end - start);
            const row = Math.min(buffer.length - 1,Math.floor(keyboardSelection.head / cols));
            if (row < buffer.viewportY) term.scrollToLine(row);
            else if (row >= buffer.viewportY + term.rows) term.scrollToLine(row - term.rows + 1);
          }
          return false;
        }
        if (event.type === 'keydown' && !['Shift','Control','Alt','Meta'].includes(event.key)) keyboardSelection = null;
        if (event.type==='keydown' && (event.ctrlKey || event.metaKey) && !event.altKey) {
          const key=event.key.toLowerCase();
          if (key==='c' && (event.shiftKey || term.hasSelection())) { copySelection(config.id).catch(report);event.preventDefault();return false; }
          if (key==='v') { pasteText(config.id).catch(report);event.preventDefault();return false; }
        }
        return true;
      });
      term.onData(data => api.terminalWrite(config.id, data).catch(report));
      sessions.set(config.id, { ...config, term, fit, view, tab });
      if (pending.has(config.id)) { term.write(pending.get(config.id)); pending.delete(config.id); }
      select(config.id); status.textContent = admin ? 'Administrator session' : 'Terminal ready';
    } catch (error) { report(error); }
  }
  async function copySelection(id=active) {
    const text=sessions.get(id)?.term.getSelection();
    if (text) await api.clipboardWriteText(text);
  }
  async function pasteText(id=active) {
    const session=sessions.get(id);if(!session)return;
    const text=await api.clipboardReadText();
    if (!text || sessions.get(id)!==session) return;
    // xterm preserves the shell's bracketed-paste handling; no Enter is added.
    session.term.paste(text);session.term.focus();
  }
  function mount(container, suppliedApi) {
    host = container; api = suppliedApi;
    host.classList.add('terminal-panel');
    const controls = element('div', '', 'terminal-controls');
    const location = element('div', '', 'terminal-location'), shells = element('div', '', 'terminal-shell-actions'), commands = element('div', '', 'terminal-command-actions');
    controls.append(location, shells, commands);
    const cwd = element('input', '', 'terminal-cwd'); cwd.placeholder = 'Working folder (default: home)'; cwd.setAttribute('aria-label', 'Terminal working folder'); location.append(cwd);
    const button = (label, fn, target = commands, title = label) => { const el = element('button', label); el.title=title; el.setAttribute('aria-label',title); el.type = 'button'; el.onmousedown=event=>event.preventDefault(); el.onclick = () => Promise.resolve().then(fn).catch(report); target.append(el); };
    button('▱', async () => { const folder = await api.chooseFolder?.(); if (folder) cwd.value = folder; }, location, 'Choose working folder');
    button('+ PS', () => create('powershell'), shells, 'New PowerShell'); button('+ CMD', () => create('cmd'), shells, 'New Command Prompt'); button('♢ PS', () => create('powershell', true), shells, 'New administrator PowerShell'); button('♢ CMD', () => create('cmd', true), shells, 'New administrator Command Prompt');
    button('⌧', () => sessions.get(active)?.term.write('\x1b[2J\x1b[H'), commands, 'Clear screen');
    button('⌫', () => sessions.get(active)?.term.clear(), commands, 'Clear scrollback');
    button('⧉', () => copySelection(), commands, 'Copy selection (Ctrl+C)');
    button('▣', () => pasteText(), commands, 'Paste (Ctrl+V)');
    button('■', () => { if (active) return api.terminalWrite(active, '\x03'); }, commands, 'Interrupt (Ctrl+C)');
    button('↻', async () => { const s = sessions.get(active); if (!s) return; cwd.value = s.cwd; await close(); await create(s.shell, s.admin); }, commands, 'Restart session');
    button('×', close, commands, 'Close session');
    const status = element('p', 'Create a CMD or PowerShell session.', 'terminal-status'); status.setAttribute('role', 'status');
    const adminHint = element('p', '', 'terminal-admin-hint'); adminHint.hidden=true;
    host.append(controls, element('div', '', 'terminal-tabs'), element('div', '', 'terminal-views'), status, adminHint);
    api.onEvent(event => {
      if (event.type !== 'terminal') return;
      const s = sessions.get(event.id); if (!s) {
        if (event.event === 'data') {
          if (!pending.has(event.id)) { if (pending.size >= 16) pending.delete(pending.keys().next().value); setTimeout(() => pending.delete(event.id), 60000); }
          pending.set(event.id, ((pending.get(event.id) || '') + event.data).slice(-128000));
        }
        return;
      }
      if (event.event === 'data') s.term.write(event.data);
      else if (event.event === 'exit') { s.term.write('\r\n[Session ended]\r\n'); s.tab.textContent += ' · ended'; }
      else if (event.event === 'error') report(event.data);
    });
    new ResizeObserver(() => resize()).observe(host);
  }
  async function close() { const s = sessions.get(active); if (!s) return; await api.terminalClose(s.id); s.term.dispose(); s.view.remove(); s.tab.remove(); sessions.delete(s.id); active = sessions.keys().next().value; if (active) select(active); }
  window.PetDockTerminal = { mount, resize, create, applyTheme };
})();
