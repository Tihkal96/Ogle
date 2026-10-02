'use strict';
// The official interactive CLI owns prompts, authentication and approvals.
window.OgleClaude=(()=>{
  let config,threads=[],active,loaded=false,creating=false,zoom=1;
  const sessions=new Map(),pending=new Map(),activityStates=new Map(),unread=new Set();
  const el=id=>document.getElementById('claude-'+id);
  const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const visible=()=>config && config.state.mode==='expand' && config.state.dockVisible!==false && !document.hidden && (!config.state.fullscreenPanel||config.state.fullscreenPanel==='claude') && (config.state.activePanel==='claude'||config.state.pinnedPanel==='claude');
  function activity(){if(visible()&&active)unread.delete(active);config?.onActivity({working:[...activityStates.values()].some(s=>s==='working'),waiting:[...activityStates.values()].some(s=>s==='waiting'),unread:unread.size>0});}
  function theme(){const light=config.state.settings.theme==='light';return {background:light?'#ffffff':config.state.settings.theme==='midnight'?'#0c1725':'#111315',foreground:light?'#171a1d':'#e4e7ea',cursor:light?'#171a1d':'#e4e7ea',selectionBackground:light?'#b9cde5':'#36506b'};}
  function applyTheme(){for(const session of sessions.values())session.term.options.theme=theme();}
  function layout(){const s=sessions.get(active);if(!s||!visible())return;try{s.fit.fit();config.api.claudeResize(s.id,s.term.cols,s.term.rows).catch(()=>{});}catch{}}
  function select(id){active=id;for(const s of sessions.values()){s.view.hidden=s.id!==id;s.tab.classList.toggle('selected',s.id===id);}activity();requestAnimationFrame(()=>{layout();sessions.get(id)?.term.focus();});}
  function renderList(){const query=el('search').value.toLowerCase(),cwd=el('project').value;el('list').replaceChildren();for(const thread of threads.filter(t=>(!cwd||t.cwd===cwd)&&`${t.title} ${t.cwd}`.toLowerCase().includes(query))){const button=make('button',thread.title||'Untitled chat');button.title=thread.cwd||'';button.append(make('small',String(thread.cwd||'').split(/[\\/]/).pop()||''));button.onclick=()=>create({cwd:thread.cwd,resume:thread.id}).catch(config.report);el('list').append(button);}}
  async function refresh(){const result=await config.api.claudeListThreads();threads=result.threads||[];const cwd=el('project').value;el('project').replaceChildren(new Option('All projects',''));for(const path of [...new Set(threads.map(t=>t.cwd).filter(Boolean))])el('project').add(new Option(path.split(/[\\/]/).pop(),path));el('project').value=cwd;renderList();}
  async function status(){const result=await config.api.claudeStatus();el('setup').hidden=result.installed;el('status').textContent=result.installed?'Official Claude Code · /login, /model, /effort and /resume are available in the terminal.':'Claude Code is not installed. Setup opens its official installer here.';return result;}
  async function create(options){
    if(creating)return;const existing=options.resume&&[...sessions.values()].find(s=>s.resume===options.resume&&!s.ended);if(existing){select(existing.id);return;}
    creating=true;el('new').disabled=true;el('setup').disabled=true;
    try{
      const result=await config.api.claudeCreate({...options,cols:80,rows:24});
      const view=make('div');view.className='claude-terminal-view';el('views').append(view);
      const term=new window.PetDockVendors.Terminal({cursorBlink:true,fontSize:12*zoom,fontFamily:'"Cascadia Mono",Consolas,monospace',scrollback:5000,theme:theme()}),fit=new window.PetDockVendors.FitAddon();term.loadAddon(fit);term.open(view);
      const tab=make('button',options.setup?'Setup':String(options.cwd||'Claude').split(/[\\/]/).pop());tab.onclick=()=>select(result.id);el('sessions').append(tab);
      const session={...result,resume:options.resume,term,fit,view,tab};sessions.set(result.id,session);
      term.onData(data=>config.api.claudeWrite(result.id,data).catch(config.report));
      term.attachCustomKeyEventHandler(event=>{if(event.type==='keydown'&&event.ctrlKey&&!event.altKey){if(event.key.toLowerCase()==='c'&&term.hasSelection()){event.preventDefault();config.api.clipboardWriteText(term.getSelection()).catch(config.report);return false;}if(event.key.toLowerCase()==='v'){event.preventDefault();config.api.clipboardReadText().then(text=>term.paste(text)).catch(config.report);return false;}}return true;});
      for(const data of pending.get(result.id)||[])term.write(data);pending.delete(result.id);select(result.id);
    }finally{creating=false;el('new').disabled=false;el('setup').disabled=false;}
  }
  function event(event){if(!config)return;
    if(event.type==='claude-terminal'){
      const s=sessions.get(event.id);if(event.event==='data'){if(s)s.term.write(event.data);else{const data=pending.get(event.id)||[];data.push(event.data);if(data.length>200)data.shift();pending.set(event.id,data);}}
      else if(event.event==='session'){if(s)s.resume=event.resume;}
      else if(event.event==='exit'){if(s){s.ended=true;s.term.write('\r\n[Session ended]\r\n');}activityStates.delete(event.id);activity();status().catch(config.report);refresh().catch(config.report);}return;
    }
    if(event.type==='claude-activity'){activityStates.set(event.threadId,event.state);if(event.state==='done')unread.add(event.threadId);if(event.state==='failed')config.onFailure();activity();}
  }
  async function open(){if(!loaded){loaded=true;try{await Promise.all([status(),refresh()]);}catch(err){loaded=false;config.report(err);}}activity();requestAnimationFrame(layout);}
  function mount(options){config=options;el('panel').innerHTML=`<aside class="claude-sidebar"><input id="claude-search" type="search" placeholder="Find a chat…" aria-label="Find a Claude chat"><select id="claude-project" aria-label="Claude project filter"></select><div id="claude-list" class="claude-thread-list"></div><button id="claude-new" title="New Claude Code session in folder" aria-label="New Claude Code session in folder">＋</button></aside><section class="claude-main"><div class="claude-controls"><strong>Claude Code</strong><button id="claude-refresh" title="Refresh chats" aria-label="Refresh Claude chats">↻</button><button id="claude-copy" title="Copy selected text" aria-label="Copy Claude selection">⧉</button><button id="claude-paste" title="Paste into Claude" aria-label="Paste into Claude">▣</button><button id="claude-close" title="Close current terminal session" aria-label="Close current Claude session">×</button><button id="claude-setup" hidden>Set up Claude Code</button></div><div id="claude-sessions"></div><div id="claude-views"></div><p id="claude-status"></p></section>`;
    el('search').oninput=renderList;el('project').onchange=renderList;el('refresh').onclick=()=>Promise.all([refresh(),status()]).catch(config.report);
    el('new').onclick=async()=>{try{const cwd=await config.api.chooseFolder();if(cwd)await create({cwd});}catch(err){config.report(err);}};
    el('setup').onclick=()=>create({setup:true}).catch(config.report);
    el('copy').onclick=()=>{const text=sessions.get(active)?.term.getSelection();if(text)config.api.clipboardWriteText(text).catch(config.report);};
    el('paste').onclick=()=>config.api.clipboardReadText().then(text=>{sessions.get(active)?.term.paste(text);sessions.get(active)?.term.focus();}).catch(config.report);
    el('close').onclick=async()=>{const s=sessions.get(active);if(!s)return;try{await config.api.claudeClose(active);s.term.dispose();s.view.remove();s.tab.remove();sessions.delete(active);activityStates.delete(active);unread.delete(active);select(sessions.keys().next().value);}catch(err){config.report(err);}};
    new ResizeObserver(layout).observe(el('views'));
  }
  return {mount,open,event,acknowledge:activity,layout,applyTheme,setZoom:factor=>{zoom=factor;for(const s of sessions.values())s.term.options.fontSize=Math.round(12*factor);layout();}};
})();
