'use strict';
window.PetDockEditor = (() => {
  let root, api, settings, save, report, tabs = [], activeId, view, area, timer, loading = false, status;
  let currentTheme = 'dark', themeSlot, languageSlot, renderedId;
  const sessions = new Map();
  const languages = ['text','javascript','typescript','json','python','html','css','markdown','shell','powershell','c','cpp','csharp','vb','cmd','sql'];
  const byId = () => tabs.find(tab => tab.id === activeId);
  const label = (tag, text, className) => { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; };
  const button = (text, action, title) => { const node = label('button',text); node.type = 'button'; node.onmousedown = event => event.preventDefault(); node.onclick = () => Promise.resolve().then(action).catch(report); if (title) { node.title = title; node.setAttribute('aria-label',title); } return node; };
  function infer(path) { const ext = path?.split('.').pop().toLowerCase(); return ({js:'javascript',mjs:'javascript',cjs:'javascript',ts:'typescript',tsx:'typescript',jsx:'javascript',json:'json',py:'python',html:'html',htm:'html',css:'css',md:'markdown',ps1:'powershell',sh:'shell',bat:'cmd',cmd:'cmd',c:'c',h:'c',cpp:'cpp',hpp:'cpp',cs:'csharp',vb:'vb',sql:'sql'})[ext] || 'text'; }
  async function flush() { autosave?.cancel(); await save({editorTabs:tabs.map(({id,name,path,language,text,dirty,framework})=>({id,name,path,language,text,dirty,framework})),activeEditorTab:activeId || ''}); }
  let autosave;
  function schedule() {autosave.schedule();}
  function languageExtension(language) {
    const vendors = window.PetDockVendors;
    if (!vendors) return [];
    if (language === 'typescript') return vendors.javascript({typescript:true,jsx:true});
    if (language === 'javascript') return vendors.javascript({jsx:true});
    if (language === 'json' && vendors.jsonParseLinter) return [vendors.json(),vendors.linter(vendors.jsonParseLinter()),vendors.lintGutter()];
    if (['shell','powershell','c','csharp','vb','cmd'].includes(language)) { const mode=vendors[language==='cmd'?'batch':language]; return mode ? vendors.StreamLanguage.define(mode) : []; }
    return typeof vendors[language] === 'function' ? vendors[language]() : [];
  }
  function updated(text) { if (loading || !byId()) return; const tab = byId(),wasDirty=tab.dirty; tab.text = text; tab.dirty = tab.savedText === undefined || tab.text !== tab.savedText; schedule(); if(wasDirty!==tab.dirty)renderTabs(); updateStatus(); }
  function updateStatus(message) {
    const tab = byId(); if (!tab) return;
    status.replaceChildren();
    const location = label('span',message || (tab.path || 'Scratch tab · automatically kept in Ogle')); location.title = tab.path || ''; status.append(location);
    let detail = `${view?.state.doc.lines || tab.text.split('\n').length} lines · ${tab.dirty ? 'Unsaved file changes' : 'Saved'}`;
    let issue = false;
    if(tab.language==='json')detail+=' · JSON diagnostics in the gutter';
    const hints=root.querySelector('.editor-hints'); hints.hidden=true;
    if (['csharp','vb'].includes(tab.language) && tab.framework && tab.framework!=='modern') {
      const findings=[]; if(/\b(async|await)\b/i.test(tab.text)) findings.push('Async/await needs a newer compiler and async support than the original toolchain.');
      if(tab.framework==='3.5' && /\b(dynamic|Task|Parallel)\b/.test(tab.text)) findings.push('Possible API or language feature introduced after .NET 3.5.');
      hints.textContent=`.NET ${tab.framework} profile · best-effort hints, not compiler validation. ${findings.join(' ') || 'No known compatibility patterns found; references and build settings still matter.'}`;hints.hidden=false;
    }
    const check = label('span',detail,issue ? 'issue' : ''); check.title = detail; status.append(check);
  }
  function renderTabs() {
    const strip = root.querySelector('.editor-tabs'); strip.replaceChildren();
    for (const tab of tabs) {
      const item = document.createElement('div'); item.className = 'editor-tab' + (tab.id === activeId ? ' active' : '');
      item.append(button(`${tab.dirty ? '• ' : ''}${tab.name}`,()=>select(tab.id),tab.path || 'Scratch tab'));
      item.append(button('×',()=>close(tab.id),'Close tab')); strip.append(item);
    }
  }
  function close(id) {
    const tab = tabs.find(t=>t.id === id); if (!tab) return;
    if (tab.dirty && !tab.closeConfirmed) {
      select(id); status.replaceChildren(label('span','Close this tab and discard its unsaved text?'));
      status.append(button('Discard and close',()=>{tab.closeConfirmed=true;close(id);}),button('Keep tab',()=>updateStatus())); return;
    }
    tabs = tabs.filter(t=>t.id !== id);
    sessions.delete(id);
    if (!tabs.length) create(); else if (id === activeId) select(tabs[0].id); else renderTabs();
    schedule();
  }
  function focusEditor() { if (!root.hidden) { if (view) view.focus(); else area.querySelector("textarea")?.focus(); } }
  function select(id) {
    const tab = tabs.find(item => item.id === id); if (!tab) return;
    // Keep each document's history and viewport in memory, never in settings.
    if (view && tabs.some(item => item.id === renderedId)) sessions.set(renderedId,{state:view.state,themeSlot,languageSlot,top:view.scrollDOM.scrollTop,left:view.scrollDOM.scrollLeft});
    activeId = id; renderedId = id;
    loading = true; view?.destroy(); view = null; area.replaceChildren();
    const vendors = window.PetDockVendors;
    if (vendors?.EditorView) {
      const tabKey = vendors.Prec.highest(vendors.keymap.of([{ key:'Tab', preventDefault:true,
        run(editor) { if (vendors.completionStatus(editor.state) === 'active') { vendors.acceptCompletion(editor); return true; } return vendors.indentWithTab.run(editor); },
        shift:vendors.indentWithTab.shift
      }]));
      const session = sessions.get(id);
      if (session) {
        themeSlot=session.themeSlot; languageSlot=session.languageSlot;
        view=new vendors.EditorView({state:session.state,parent:area});
        view.dispatch({effects:[themeSlot.reconfigure(editorTheme(currentTheme)),languageSlot.reconfigure(languageExtension(tab.language))]});
        view.scrollDOM.scrollTop=session.top; view.scrollDOM.scrollLeft=session.left;
      } else view = new vendors.EditorView({doc:tab.text,parent:area,extensions:[tabKey,vendors.basicSetup,(themeSlot = new vendors.Compartment()).of(editorTheme(currentTheme)),(languageSlot = new vendors.Compartment()).of(languageExtension(tab.language)),vendors.EditorView.updateListener.of(update=>{if(update.docChanged) updated(update.state.doc.toString());})]});
    } else {
      const textarea = document.createElement('textarea'); textarea.className = 'editor-fallback'; textarea.value = tab.text; textarea.spellcheck = false; textarea.setAttribute('aria-label','Code editor'); textarea.oninput = () => updated(textarea.value); area.append(textarea);
    }
    root.querySelector('.editor-language').value = tab.language; root.querySelector('.editor-framework').value=tab.framework || 'modern'; root.querySelector('.editor-framework').hidden=!['csharp','vb'].includes(tab.language); loading = false; renderTabs(); updateStatus(); schedule(); focusEditor();
  }
  function create(text = '') { const tab = {id:crypto.randomUUID(),name:`Untitled ${tabs.filter(t=>!t.path).length+1}`,path:'',language:'text',text,savedText:'',dirty:Boolean(text)}; tabs.push(tab); select(tab.id); return tab.id; }
  async function open() { const file = await api.editorOpen(); if (!file) return; const existing = tabs.find(t=>t.path === file.path); if (existing) return select(existing.id); const tab = {id:crypto.randomUUID(),name:file.name,path:file.path,text:file.text,language:infer(file.path),savedText:file.text,dirty:false}; tabs.push(tab); select(tab.id); }
  async function write(saveAs = false) { const tab = byId(); if (!tab) return; const captured = tab.text; const result = await api.editorSave({path:tab.path || undefined,text:captured,saveAs}); if (!result) return; tab.path = result.path; tab.name = result.name; tab.savedText = captured; tab.dirty = tab.text !== captured; if(tab.language === 'text') tab.language = infer(result.path); if(tab.id === activeId) select(tab.id); else renderTabs(); await flush(); }
  function getSelection() {
    return view ? view.state.selection.ranges.filter(range=>!range.empty).map(range=>view.state.sliceDoc(range.from,range.to)).join('\n') : (()=>{const input=area?.querySelector('textarea');return input?input.value.slice(input.selectionStart,input.selectionEnd):'';})();
  }
  async function newFromText(text) {
    if(typeof text!=='string')throw new TypeError('Editor text must be a string.');
    if(text.length>100000)throw new RangeError('Selection is too large for a new editor tab (100,000 characters maximum).');
    const id=create(text);await flush();return id;
  }
  async function copySelection() {
    const text = getSelection();
    if (text) await api.clipboardWriteText(text);
  }
  async function pasteText() {
    const editor=view, tabId=activeId, input=area.querySelector('textarea');
    const text=await api.clipboardReadText();
    // A delayed clipboard reply must never paste into a newly selected tab.
    if (!text || tabId!==activeId || editor!==view) return;
    if (editor) { editor.dispatch(editor.state.replaceSelection(text)); editor.focus(); }
    else if (input?.isConnected) { input.setRangeText(text,input.selectionStart,input.selectionEnd,'end'); updated(input.value);input.focus(); }
  }
  function mount(container, bridge, initial, persist, onError) {
    root=container;api=bridge;settings=initial;save=persist;report=onError;autosave=new window.OgleAutosave(flush,{report});currentTheme=settings.theme || 'dark';
    tabs=(Array.isArray(settings.editorTabs)?settings.editorTabs:[]).map(tab=>({...tab,language:languages.includes(tab.language)?tab.language:'text',savedText:tab.dirty ? undefined : tab.text,dirty:Boolean(tab.dirty) || (!tab.path && !!tab.text)}));
    const controls=document.createElement('div'); controls.className='subtoolbar'; controls.append(button('＋',create,'New tab'),button('▱',open,'Open file'),button('↓',()=>write(false),'Save file (Ctrl+S)'),button('⇲',()=>write(true),'Save file as'),button('⧉',copySelection,'Copy selection'),button('▣',pasteText,'Paste'));
    const spacer=document.createElement('span');spacer.className='spacer';controls.append(spacer);
    const language=document.createElement('select');language.className='editor-language';language.setAttribute('aria-label','Programming language');for(const value of languages)language.add(new Option(value,value));language.onchange=()=>{byId().language=language.value;select(activeId);};controls.append(language);
    const framework=document.createElement('select');framework.className='editor-framework';framework.setAttribute('aria-label','.NET framework profile');for(const [value,text] of [['modern','Modern .NET'],['3.5','.NET 3.5'],['4','.NET 4']])framework.add(new Option(text,value));framework.onchange=()=>{byId().framework=framework.value;updateStatus();schedule();focusEditor();};controls.append(framework);
    const strip=document.createElement('div');strip.className='editor-tabs';area=document.createElement('div');area.className='editor-surface';status=document.createElement('div');status.className='editor-status';const hints=document.createElement('div');hints.className='editor-hints';hints.hidden=true;root.append(controls,strip,area,hints,status);
    root.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();write(event.shiftKey).catch(report);}});
    installSearchDialog();
    if(tabs.length)select(tabs.some(t=>t.id===settings.activeEditorTab)?settings.activeEditorTab:tabs[0].id);else create();
  }
  function installSearchDialog() {
    // Retain CodeMirror's search commands and key bindings in a floating dialog.
    const enhance = () => {
      const panel = root.querySelector('.cm-search');
      if (!panel || panel.dataset.ogleDialog) return;
      panel.dataset.ogleDialog = 'true'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Find and replace');
      panel.parentElement.classList.add('ogle-search-popout');
      for (const [name,text,title] of [['next','↓','Next match'],['prev','↑','Previous match'],['select','All','Select all matches'],['replace','Replace','Replace match'],['replaceAll','Replace all','Replace all matches'],['close','×','Close find and replace']]) {
        const control = panel.querySelector(`button[name="${name}"]`);
        if (control) { control.textContent=text;control.title=title;control.setAttribute('aria-label',title); }
      }
    };
    const dismiss = () => {
      if (document.body.classList.contains('collapsed') || root.hidden) root.querySelector('.cm-search button[name="close"]')?.click();
    };
    new MutationObserver(enhance).observe(area,{childList:true,subtree:true});
    new MutationObserver(dismiss).observe(document.body,{attributes:true,attributeFilter:['class']});
    new MutationObserver(dismiss).observe(root,{attributes:true,attributeFilter:['hidden']});
  }
  function editorTheme(theme) {
    const vendors = window.PetDockVendors, light = theme === 'light', midnight = theme === 'midnight';
    const bg = light ? '#ffffff' : midnight ? '#0c1725' : '#111315';
    const fg = light ? '#171a1d' : midnight ? '#dce8f5' : '#e4e7ea';
    return [vendors.EditorView.theme({
      '&': { backgroundColor:bg, color:fg },
      '.cm-content': { caretColor:fg },
      '.cm-cursor,.cm-dropCursor': { borderLeftColor:fg },
      '.cm-gutters': { backgroundColor:light ? '#f1f3f5' : midnight ? '#101e30' : '#1a1d20', color:light ? '#626b75' : '#909aa5', border:'none' },
      // Selection is drawn behind content: an opaque active row hides the selected range.
      '.cm-activeLine': { backgroundColor:'transparent', boxShadow:`inset 2px 0 ${light ? '#c4ccd6' : '#394a5c'}` },
      '.cm-activeLineGutter': { backgroundColor:light ? '#e9edf2' : midnight ? '#1b3048' : '#24292e' },
      // Match One Dark's focused selector specificity so its pale fill cannot win.
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground,.cm-selectionBackground': { backgroundColor:light ? '#9fc8fa' : '#245c91' },
      '.cm-content ::selection': { backgroundColor:light ? '#9fc8fa' : '#245c91' },
      // Other occurrences are references, not selected text. Avoid a second filled highlight.
      '.cm-selectionMatch': { backgroundColor:'transparent', textDecoration:'underline', textDecorationColor:light ? '#5479a3' : '#7c9cbe', textUnderlineOffset:'3px' },
      '.cm-panels,.cm-tooltip': { backgroundColor:light ? '#f1f3f5' : '#1a1d20', color:fg, border:'1px solid ' + (light ? '#b8c0c8' : '#3b444d') }
    }, {dark:!light}), light ? [] : vendors.oneDark];
  }
  function applyTheme(theme) {
    currentTheme = ['dark','light','midnight'].includes(theme) ? theme : 'dark';
    if(view && themeSlot) view.dispatch({effects:themeSlot.reconfigure(editorTheme(currentTheme))});
  }
  function restoreWorkspace(next){
    const focus=document.activeElement;autosave.cancel();view?.destroy();view=null;sessions.clear();renderedId=null;activeId=null;
    tabs=(next.editorTabs||[]).map(tab=>({...tab,savedText:tab.dirty?undefined:tab.text}));
    if(tabs.length)select(tabs.some(tab=>tab.id===next.activeEditorTab)?next.activeEditorTab:tabs[0].id);else create();
    if(focus?.isConnected)focus.focus();
  }
  return {mount,flush,snapshot:()=>({editorTabs:tabs.map(({id,name,path,language,text,dirty,framework})=>({id,name,path,language,text,dirty,framework})),activeEditorTab:activeId||''}),restoreWorkspace,applyTheme,getSelection,newFromText,measure:()=>view?.requestMeasure()};
})();
