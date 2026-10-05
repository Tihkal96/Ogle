'use strict';
// The official interactive CLI owns prompts, authentication and approvals.
window.OgleClaude=(()=>{
  let config,threads=[],active,loaded=false,creating=false,zoom=1,installed=false;
  const sessions=new Map(),pending=new Map(),activityStates=new Map(),unread=new Set();
  const el=id=>document.getElementById('claude-'+id);
  const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const visible=()=>config && config.state.mode==='expand' && config.state.dockVisible!==false && !document.hidden && (!config.state.fullscreenPanel||config.state.fullscreenPanel==='claude') && (config.state.activePanel==='claude'||config.state.pinnedPanel==='claude');
  function activity(){if(visible()&&active)unread.delete(active);config?.onActivity({working:[...activityStates.values()].some(s=>s==='working'),waiting:[...activityStates.values()].some(s=>s==='waiting'),unread:unread.size>0});}
  function theme(){const light=config.state.settings.theme==='light';return {background:light?'#ffffff':config.state.settings.theme==='midnight'?'#0c1725':'#111315',foreground:light?'#171a1d':'#e4e7ea',cursor:light?'#171a1d':'#e4e7ea',selectionBackground:light?'#b9cde5':'#36506b'};}
  function applyTheme(){for(const session of sessions.values())session.term.options.theme=theme();}
  function layout(){const s=sessions.get(active);if(!s||!visible())return;try{s.fit.fit();const dimensions=s.term.cols+'x'+s.term.rows;if(!s.ended&&s.dimensions!==dimensions){s.dimensions=dimensions;config.api.claudeResize(s.id,s.term.cols,s.term.rows).catch(()=>{});}}catch{}}
  function controls(){const s=sessions.get(active),ready=!!s&&!s.ended;for(const key of ['paste','up','down','enter','command'])el(key).disabled=!ready;el('copy').disabled=!s;el('close').disabled=!s;el('empty').hidden=!!s;el('folder').textContent=s?.cwd||'Choose a project folder to start';el('folder').title=s?.cwd||'';}
  function select(id){active=id;for(const s of sessions.values()){s.view.hidden=s.id!==id;s.tab.classList.toggle('selected',s.id===id);}controls();activity();requestAnimationFrame(()=>{layout();sessions.get(id)?.term.focus();});}
  function renderList(){const query=el('search').value.toLowerCase(),cwd=el('project').value;el('list').replaceChildren();for(const thread of threads.filter(t=>(!cwd||t.cwd===cwd)&&`${t.title} ${t.cwd}`.toLowerCase().includes(query))){const button=make('button',thread.title||'Untitled chat');button.title=thread.cwd||'';button.append(make('small',(String(thread.cwd||'').split(/[\\/]/).pop()||'')+(thread.updatedAt?' - '+new Date(thread.updatedAt).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'')));button.onclick=()=>create({cwd:thread.cwd,resume:thread.id}).catch(config.report);el('list').append(button);}}
  async function refresh(){const result=await config.api.claudeListThreads();threads=result.threads||[];const cwd=el('project').value;el('project').replaceChildren(new Option('All projects',''));for(const path of [...new Set(threads.map(t=>t.cwd).filter(Boolean))])el('project').add(new Option(path.split(/[\\/]/).pop(),path));el('project').value=cwd;renderList();}
  async function status(){const result=await config.api.claudeStatus();installed=!!result.installed;el('setup').hidden=installed;el('empty-open').hidden=!installed;el('empty-detail').textContent=installed?'Choose the folder where Claude should work, or resume a saved session on the left. First use: select a theme with Up, Down and Enter, then follow Claude sign-in.':'Install the official Claude Code CLI using Set up Claude Code above, then choose a project folder.';el('status').textContent=installed?'Official Claude Code terminal - Click to type; arrows and Enter control menus.':'Claude Code is not installed.';return result;}
  async function create(options){
    if(creating)return;const existing=options.resume&&[...sessions.values()].find(s=>s.resume===options.resume&&!s.ended);if(existing){select(existing.id);return;}
    creating=true;el('new').disabled=true;el('setup').disabled=true;
    try{
      const result=await config.api.claudeCreate({...options,cols:80,rows:24});
      const view=make('div');view.className='claude-terminal-view';el('views').append(view);
      const term=new window.PetDockVendors.Terminal({cursorBlink:true,fontSize:12*zoom,fontFamily:'"Cascadia Mono",Consolas,monospace',scrollback:5000,theme:theme()}),fit=new window.PetDockVendors.FitAddon();term.loadAddon(fit);term.open(view);
      const tab=make('button',options.setup?'Setup':(options.resume?threads.find(t=>t.id===options.resume)?.title:null)||String(options.cwd||'Claude').split(/[\\/]/).pop());tab.onclick=()=>select(result.id);el('sessions').append(tab);
      const session={...result,cwd:result.cwd||options.cwd,resume:options.resume,term,fit,view,tab};sessions.set(result.id,session);
      term.onData(data=>{if(!session.ended)config.api.claudeWrite(result.id,data).catch(config.report);});
      term.attachCustomKeyEventHandler(event=>{if(event.type==='keydown'&&event.ctrlKey&&!event.altKey){if(event.key.toLowerCase()==='c'&&term.hasSelection()){event.preventDefault();config.api.clipboardWriteText(term.getSelection()).catch(config.report);return false;}if(event.key.toLowerCase()==='v'){event.preventDefault();config.api.clipboardReadText().then(text=>term.paste(text)).catch(config.report);return false;}}return true;});
      const buffered=pending.get(result.id)||[];pending.delete(result.id);for(const item of buffered)event(item);select(result.id);
    }finally{creating=false;pending.clear();el('new').disabled=false;el('setup').disabled=false;}
  }
  function event(event){if(!config)return;
    if(event.type==='claude-terminal'){
      const s=sessions.get(event.id);if(!s){if(creating){const buffered=pending.get(event.id)||[];buffered.push(event);if(buffered.length>200)buffered.shift();pending.set(event.id,buffered);}return;}if(event.event==='data'){s.term.write(event.data);}
      else if(event.event==='session'){if(s)s.resume=event.resume;}
      else if(event.event==='exit'){if(s){s.ended=true;s.term.write('\r\n[Session ended]'+(event.exitCode!=null?' · exit '+event.exitCode:'')+'\r\n');}controls();activityStates.delete(event.id);activity();status().catch(config.report);refresh().catch(config.report);}return;
    }
    if(event.type==='claude-activity'){activityStates.set(event.threadId,event.state);if(event.state==='done')unread.add(event.threadId);if(event.state==='failed')config.onFailure();activity();}
  }
  async function open(){if(!loaded){loaded=true;try{await Promise.all([status(),refresh()]);}catch(err){loaded=false;config.report(err);}}activity();requestAnimationFrame(()=>{layout();sessions.get(active)?.term.focus();});}
  function mount(options){config=options;el('panel').innerHTML=`<aside class="claude-sidebar"><input id="claude-search" type="search" placeholder="Find a chat…" aria-label="Find a Claude chat"><select id="claude-project" aria-label="Claude project filter"></select><div id="claude-list" class="claude-thread-list"></div><button id="claude-new" title="New Claude Code session in folder" aria-label="New Claude Code session in folder">+ Open project</button></aside><section class="claude-main"><div class="claude-controls"><strong>Claude Code</strong><button id="claude-refresh" title="Refresh chats" aria-label="Refresh Claude chats">↻</button><button id="claude-copy" title="Copy selected text" aria-label="Copy Claude selection">⧉</button><button id="claude-paste" title="Paste into Claude" aria-label="Paste into Claude">▣</button><button id="claude-up" title="Previous terminal option (Up arrow)" aria-label="Previous terminal option">↑</button><button id="claude-down" title="Next terminal option (Down arrow)" aria-label="Next terminal option">↓</button><button id="claude-enter" title="Confirm terminal option (Enter)" aria-label="Confirm terminal option">↵</button><button id="claude-close" title="Close current terminal session" aria-label="Close current Claude session">×</button><select id="claude-command" aria-label="Claude terminal command" title="Insert an official Claude command; Enter runs it"><option value="">Commands...</option><option value="/login">Sign in</option><option value="/model">Model / effort</option><option value="/status">Status</option><option value="/help">Help</option></select><button id="claude-setup" hidden>Set up Claude Code</button></div><div id="claude-folder"></div><div id="claude-sessions"></div><div id="claude-views"><div id="claude-empty"><strong>Claude works inside your project folder</strong><p id="claude-empty-detail"></p><button id="claude-empty-open">Open project folder...</button><p>Saved sessions belong to Claude Code. Signing in, permissions and model choices stay in its terminal.</p></div></div><p id="claude-status"></p></section>`;
    el('search').oninput=renderList;el('project').onchange=renderList;el('refresh').onclick=()=>Promise.all([refresh(),status()]).catch(config.report);
    el('new').onclick=async()=>{try{const cwd=await config.api.chooseFolder();if(cwd)await create({cwd});}catch(err){config.report(err);}};
    el('empty-open').onclick=()=>el('new').click();
    el('command').onchange=()=>{const command=el('command').value,s=sessions.get(active);el('command').value='';if(command&&s&&!s.ended){s.term.paste(command);s.term.focus();}};
    el('setup').onclick=()=>create({setup:true}).catch(config.report);
    for(const [key,data] of [['up','\u001b[A'],['down','\u001b[B'],['enter','\r']])el(key).onclick=()=>{const s=sessions.get(active);if(!s||s.ended)return;config.api.claudeWrite(s.id,data).then(()=>s.term.focus()).catch(config.report);};
    el('copy').onclick=()=>{const text=sessions.get(active)?.term.getSelection();if(text)config.api.clipboardWriteText(text).catch(config.report);};
    el('paste').onclick=()=>config.api.clipboardReadText().then(text=>{sessions.get(active)?.term.paste(text);sessions.get(active)?.term.focus();}).catch(config.report);
    el('close').onclick=async()=>{const s=sessions.get(active);if(!s)return;try{await config.api.claudeClose(active);s.term.dispose();s.view.remove();s.tab.remove();sessions.delete(active);activityStates.delete(active);unread.delete(active);select(sessions.keys().next().value);}catch(err){config.report(err);}};
    controls();new ResizeObserver(layout).observe(el('views'));
  }
  return {mount,open,event,acknowledge:activity,layout,applyTheme,setZoom:factor=>{zoom=factor;for(const s of sessions.values())s.term.options.fontSize=Math.round(12*factor);layout();}};
})();
