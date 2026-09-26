'use strict';
const $ = id => document.getElementById(id);
const state = { threads: [], settings: {}, selected: null, running: new Map(), messages: new Map(), cursor: null, connected: false, collapsed: true, mode:'idle', panelPinned: false, activePanel: 'chats', petState: 'idle', chatgptWorking:false, animationStartedAt:0, animationGeneration:0 };
const api = window.dock;
function error(err) { window.OgleDiagnostics.record(err); const box=$('error');box.replaceChildren();const message=document.createElement('span');message.textContent=window.OgleDiagnostics.friendly(err);const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Dismiss message');close.onclick=clearError;box.append(message,close);box.hidden=false; }
function clearError() { $('error').hidden = true; }
async function attempt(fn) { try { clearError(); return await fn(); } catch (err) { error(err); } }
let saveQueue = Promise.resolve();
function save(partial) { Object.assign(state.settings, partial); const pending = saveQueue.then(() => api.saveSettings(partial)); saveQueue = pending.catch(error); return pending; }
function title(thread) { return thread?.name || thread?.title || thread?.preview?.slice(0, 90) || 'Untitled task'; }
function basename(path) { return String(path || '').split(/[\\/]/).filter(Boolean).pop() || 'No project'; }
function setConnection(connection, detail) { detail ||= connection?.detail; const value = typeof connection === 'object' ? connection?.state : connection; state.connected = ['ready', 'connected','desktop'].includes(value); if (['error','disconnected'].includes(value)) state.running.clear(); if(detail && !state.connected)window.OgleDiagnostics.record(detail,'Codex connection'); $('status-dot').title=state.connected?'Codex connected':'Codex not connected'; $('status-dot').setAttribute('aria-label',$('status-dot').title); $('status-dot').className = state.connected ? 'ready' : ''; $('footer-status').textContent = '';  updateComposer(); }
function compactUsesChatGPT() { return state.settings.compactChatTarget==='chatgpt'; }
function composerUsesChatGPT() { return state.composerContext==='__chatgpt__'; }
function syncComposerContext() {
  const key=state.mode==='quick' && compactUsesChatGPT()?'__chatgpt__':state.selected?.id || '';
  if(state.composerContext===key)return;
  persistDraft();state.composerContext=key;
  $('prompt').value=state.settings.drafts?.[key] || '';
  window.PetDockAttachments?.setContext(key,{allowFiles:key==='__chatgpt__'});
}
function updateComposer() {
  const gpt=composerUsesChatGPT(),running=gpt?state.chatgptWorking:state.selected && state.running.get(state.selected.id);
  $('send').disabled=!!state.chatgptSending || (!gpt && (!state.selected || !state.connected)) || !!running || (!$('prompt').value.trim() && !window.PetDockAttachments?.hasImages()) || !!window.PetDockAttachments?.isBusy();
  $('stop').hidden=gpt || !running;
  $('composer-target').textContent=gpt?'ChatGPT · active conversation':state.selected?title(state.selected):'No task selected';
  $('conversation-name').textContent=compactUsesChatGPT()?'ChatGPT · active conversation':state.selected?title(state.selected):'Choose a conversation';
  $('conversation-name').title=compactUsesChatGPT()?'Message the active ChatGPT conversation, or start a new one':state.selected?`Write to ${title(state.selected)}`:'Choose a conversation';
  $('conversation-picker-toggle').hidden=compactUsesChatGPT();
  $('prompt').placeholder=gpt?'Message ChatGPT…':state.selected?`Message ${title(state.selected).slice(0,38)}…`:'Choose a Codex task…';
  $('prompt').title=gpt?'Sends to the conversation currently open in ChatGPT':state.selected?`Send to: ${title(state.selected)}`:'Choose a task in the Codex panel first';
  updatePetState();
}
function queueReaction(kind) {
  // Keep a completion queued while another Codex task or ChatGPT is still working.
  state.pendingReaction=state.pendingReaction==='failed'?'failed':kind;
}
function updatePetState() {
  let next,restart=false;
  if(document.querySelector('.approval') || state.attention?.size) next='waiting';
  else if(state.running.size || state.chatgptWorking) next='running';
  else {
    if(state.pendingReaction) {
      state.reaction=state.pendingReaction;state.pendingReaction=null;
      state.reactionUntil=performance.now()+5000;restart=true;
    }
    next=state.reactionUntil>performance.now()?state.reaction:state.petHovered?'waving':'idle';
  }
  if(next!==state.petState || restart) {
    state.petState=next;state.animationStartedAt=performance.now();state.animationGeneration++;
  }
}
function renderThreads() {
  const position = $('thread-list').scrollTop;
  const list = $('thread-list'); list.replaceChildren();
  const query = $('search').value.toLowerCase(), cwd = $('project-filter').value;
  const pinned = state.settings.pinnedThreads || [];
  const threads = state.threads.filter(t => (!cwd || t.cwd === cwd) && (!query || `${title(t)} ${t.cwd}`.toLowerCase().includes(query))).sort((a,b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
  for (const thread of threads) { const row = document.createElement('div'); row.className = 'thread' + (state.selected?.id === thread.id ? ' current' : ''); const button = document.createElement('button'); const name = document.createElement('span'); name.className = 'thread-name'; name.textContent = (pinned.includes(thread.id) ? '★ ' : '') + title(thread); const project = document.createElement('span'); project.className = 'thread-project'; project.textContent = basename(thread.cwd); button.append(name, project); button.title = thread.cwd || title(thread); button.onclick = () => attempt(() => selectThread(thread)); row.append(button); list.append(row); }
  if (!threads.length) { const text = document.createElement('p'); text.className = 'thread-project'; text.textContent = 'No matching tasks.'; list.append(text); }
  list.scrollTop = position; renderCompactThreads();
}
function renderProjects() {
  const projects=[...new Set(state.threads.map(t=>t.cwd).filter(Boolean))].sort();
  for(const id of ['project-filter','compact-project-filter']) {
    const previous=$(id).value;$(id).replaceChildren(new Option('All projects',''));
    for(const cwd of projects)$(id).add(new Option(basename(cwd),cwd));$(id).value=previous;
  }
}
function renderCompactThreads() {
  const node=$('compact-thread-list'),position=node.scrollTop,query=$('compact-search').value.toLowerCase(),cwd=$('compact-project-filter').value;
  node.replaceChildren();const pinned=state.settings.pinnedThreads || [];
  const threads=state.threads.filter(t=>(!cwd||t.cwd===cwd)&&(!query||`${title(t)} ${t.cwd}`.toLowerCase().includes(query))).sort((a,b)=>Number(pinned.includes(b.id))-Number(pinned.includes(a.id)));
  for(const thread of threads) {
    const button=document.createElement('button');button.type='button';button.className='compact-thread'+(thread.id===state.selected?.id?' current':'');button.dataset.threadId=thread.id;
    const name=document.createElement('strong');name.textContent=(pinned.includes(thread.id)?'★ ':'')+title(thread);
    const project=document.createElement('small');project.textContent=basename(thread.cwd);button.append(name,project);button.title=thread.cwd || title(thread);
    button.onclick=()=>attempt(async()=>{await setMode('quick');await selectThread(thread);$('prompt').focus();});node.append(button);
  }
  if(!threads.length){const empty=document.createElement('p');empty.textContent='No matching conversations.';node.append(empty);}
  node.scrollTop=position;$('compact-load-more').hidden=!state.cursor;
}
$('compact-search').oninput=renderCompactThreads;$('compact-project-filter').onchange=renderCompactThreads;
$('compact-load-more').onclick=()=>attempt(()=>refresh(true));
$('conversation-picker-toggle').onclick=()=>setMode(state.mode==='picker'?'reveal':'picker');
$('conversation-name').onclick=()=>{setMode(compactUsesChatGPT() || state.selected?'quick':'picker').then(()=>{if(compactUsesChatGPT() || state.selected)$('prompt').focus();});};
async function refresh(more = false) { const result = await api.listThreads(more ? {cursor:state.cursor} : {}); const threads = Array.isArray(result) ? result : result.data || result.threads || []; state.threads = more ? [...new Map([...state.threads,...threads].map(t=>[t.id,t])).values()] : threads; state.cursor = result.nextCursor; $('load-more').hidden = !state.cursor; renderProjects(); renderThreads(); }
function contentText(item) { if (typeof item.text === 'string') return item.text; if (Array.isArray(item.content)) return item.content.map(c => c.text || (c.type?.toLowerCase().includes('image') ? '[Image]' : '')).filter(Boolean).join('\n'); return item.aggregatedOutput || item.command || item.output || ''; }
function nearBottom() { const node = $('messages'); return node.scrollHeight-node.scrollTop-node.clientHeight < 70; }
function scrollBottom() { $('messages').scrollTop = $('messages').scrollHeight; }
$('go-bottom').onclick = scrollBottom;
function addMessage(id, role, text) { const follow = nearBottom(); let element = state.messages.get(id); if (!element) { const container = $('messages'); container.querySelector('.empty')?.remove(); element = document.createElement('article'); element.className = `message ${role}`; const label = document.createElement('div'); label.className = 'message-label'; label.textContent = role === 'user' ? 'YOU' : role === 'tool' ? 'ACTIVITY' : 'CODEX'; const body = document.createElement('div'); body.className = 'message-text'; element.append(label, body); container.append(element); state.messages.set(id, element); } element.lastChild.textContent = text; if (follow) scrollBottom(); return element; }
function renderItem(item) { const type = item.type?.toLowerCase() || ''; if (type === 'usermessage') addMessage(item.id, 'user', contentText(item)); else if (type === 'agentmessage') addMessage(item.id, 'assistant', contentText(item)); else if (['commandexecution','filechange','mcpToolCall'.toLowerCase()].includes(type)) addMessage(item.id,'tool',contentText(item) || `${item.type}: ${item.status || 'completed'}`); }
let selectionVersion = 0;
async function selectThread(thread) { const version = ++selectionVersion; if (state.selected) persistDraft(); state.selected = thread; syncComposerContext(); save({lastThreadId:thread.id}); $('thread-title').textContent = title(thread); $('thread-path').textContent = thread.cwd || 'No project folder'; $('pin-thread').disabled = false; $('pin-thread').textContent = (state.settings.pinnedThreads || []).includes(thread.id) ? '★' : '☆'; state.messages.clear(); $('messages').replaceChildren(); $('activity').textContent = 'Loading conversation…'; renderThreads(); updateComposer(); const result = await api.readThread(thread.id); if (version !== selectionVersion) return; const full = result.thread || result; if(result.runtime) setRuntime(thread.id,result.runtime); for (const turn of full.turns || []) { for (const item of turn.items || []) renderItem(item); } scrollBottom(); $('activity').textContent = state.running.has(thread.id) ? 'Codex is working…' : ''; updateComposer(); }
function persistDraft() { if (state.composerContext) save({drafts:{...state.settings.drafts,[state.composerContext]:$('prompt').value}}); }
let draftTimer;
$('prompt').addEventListener('input', () => { updateComposer(); clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 350); });
$('prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); } });
$('composer').onsubmit = event => { event.preventDefault(); if ($('send').disabled) return; if(composerUsesChatGPT())return attempt(sendCompactChatGPT); attempt(async () => { const thread = state.selected, text = $('prompt').value.trim(),images=window.PetDockAttachments?.getInputs() || []; state.running.set(thread.id, 'pending'); updateComposer(); try { const result = await api.sendTurn(thread.id, text,images); const turn = result.turn || result; window.PetDockAttachments?.clear(thread.id,images); if (state.running.get(thread.id) === 'pending') state.running.set(thread.id, turn.id); if (state.selected?.id === thread.id) { if (state.composerContext===thread.id && $('prompt').value.trim() === text) { $('prompt').value = ''; persistDraft(); } if (![...state.messages.values()].some(el => el.classList.contains('user') && el.lastChild.textContent === text)) addMessage(`local-${Date.now()}`, 'user', text+(images.length?`\n[${images.length} attached image${images.length===1?'':'s'}]`:'')); $('activity').textContent = 'Codex is working…'; } } catch (err) { state.running.delete(thread.id); queueReaction('failed'); throw err; } finally { updateComposer(); } }); };
$('stop').onclick = () => attempt(() => api.interrupt(state.selected.id, state.running.get(state.selected.id)));
$('refresh').onclick = () => attempt(() => refresh()); $('load-more').onclick = () => attempt(() => refresh(true)); $('search').oninput = renderThreads; $('project-filter').onchange = renderThreads;
$('new-task').onclick = () => attempt(async () => { const cwd = await api.chooseFolder(); if (!cwd) return; const result = await api.startThread(cwd); const thread = result.thread || result; state.threads.unshift(thread); renderProjects(); await selectThread(thread); });
$('pin-thread').onclick = () => { if (!state.selected) return; const pins = new Set(state.settings.pinnedThreads || []); pins.has(state.selected.id) ? pins.delete(state.selected.id) : pins.add(state.selected.id); save({pinnedThreads:[...pins]}); $('pin-thread').textContent = pins.has(state.selected.id) ? '★' : '☆'; renderThreads(); };
let noteTimer; $('note').oninput = () => { $('note-status').textContent = 'Saving…'; clearTimeout(noteTimer); noteTimer = setTimeout(async () => { try { await save({note:$('note').value}); $('note-status').textContent = 'Saved locally'; } catch { $('note-status').textContent = 'Save failed'; } }, 400); };
function chatgptLayout() {
  const host = $('chatgpt-host'), visible = !window.DockLayoutTransition.busy && !state.collapsed && state.activePanel === 'chatgpt';
  const rect = host.getBoundingClientRect();
  api.chatgptLayout({visible,bounds:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.max(1,Math.round(rect.width)),height:Math.max(1,Math.round(rect.height))}}).catch(error);
}
function switchPanel(name) {
  state.activePanel = name;
  if (name === 'chatgpt') api.openChatGPT('show').then(chatgptLayout).catch(error);
  for (const button of document.querySelectorAll('[data-panel]')) button.classList.toggle('selected',button.dataset.panel === name);
  for (const panel of document.querySelectorAll('#expanded > .panel')) panel.hidden = panel.id !== `${name}-panel`;
  $('composer').hidden = name !== 'chats' && !state.collapsed;
  return setMode('expand').then(() => { chatgptLayout(); window.PetDockTerminal?.resize(); });
}
for (const button of document.querySelectorAll('[data-panel]')) button.onclick = () => switchPanel(button.dataset.panel);
for (const button of document.querySelectorAll('[data-chatgpt-action]')) button.onclick = () => attempt(() => api.openChatGPT(button.dataset.chatgptAction));
window.addEventListener('resize', () => { chatgptLayout(); window.PetDockTerminal?.resize(); });
let petPress = null, draggedPet = false;
$('pet').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  petPress = {x:event.screenX,y:event.screenY}; draggedPet = false;
  $('pet').setPointerCapture(event.pointerId);
  api.petDrag('start').catch(error);
});
$('pet').addEventListener('pointermove', event => {
  if (!petPress) return;
  if (Math.hypot(event.screenX-petPress.x,event.screenY-petPress.y)>5) draggedPet=true;
  if (draggedPet) { clearTimeout(hoverTimer); api.petDrag('move').catch(error); }
});
$('pet').addEventListener('pointerup', event => {
  if (!petPress) return;
  petPress=null; const wasDragged=draggedPet; api.petDrag('end').then(result=>{if(!wasDragged && !result?.moved) return api.openCodex(state.selected?.id);}).catch(error);
  if ($('pet').hasPointerCapture(event.pointerId)) $('pet').releasePointerCapture(event.pointerId);
});
$('pet').addEventListener('pointercancel',()=>{petPress=null;draggedPet=true;api.petDrag('end').catch(error);});
$('pet').onclick = event => { if(event.detail===0 && !draggedPet) attempt(() => api.openCodex(state.selected?.id)); };
$('pet').oncontextmenu = event => { event.preventDefault(); attempt(() => api.petMenu()); };
$('pet').onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); draggedPet=false; $('pet').click(); } };
$('pet').addEventListener('mouseenter',()=>{state.petHovered=true;updateComposer();});
$('pet').addEventListener('mouseleave',()=>{state.petHovered=false;updateComposer();});
async function flushLocal() {
  clearTimeout(noteTimer); clearTimeout(draftTimer);
  if (state.composerContext) await save({drafts:{...state.settings.drafts,[state.composerContext]:$('prompt').value}});
  await save({note:$('note').value}); await window.PetDockEditor?.flush();
}
$('sidebar-toggle').onclick=()=>{save({sidebarVisible:state.settings.sidebarVisible===false});applySettings();};
function setMode(mode) {
  clearTimeout(hoverTimer);clearTimeout(quickIdleTimer);
  state.mode=mode;state.collapsed=mode!=='expand';if(mode!=='idle')state.suppressHoverReveal=false;
  syncComposerContext();updateComposer();
  api.chatgptLayout({visible:false,bounds:{x:0,y:0,width:1,height:1}}).catch(error);
  return window.DockLayoutTransition.run(() => {
  document.body.classList.toggle('collapsed',mode!=='expand');
  document.body.classList.toggle('bar-idle',mode==='idle');
  document.body.classList.toggle('bar-revealed',['reveal','quick','picker'].includes(mode));
  document.body.classList.toggle('quick-compose',mode==='quick');
  document.body.classList.toggle('conversation-picker-open',mode==='picker');
  $('bar-orb').hidden=mode!=='idle';$('conversation-strip').hidden=!state.collapsed || mode==='idle';
  $('conversation-picker').hidden=mode!=='picker';$('conversation-picker-toggle').setAttribute('aria-expanded',String(mode==='picker'));
  $('composer').hidden=!(mode==='quick' || (mode==='expand' && state.activePanel==='chats'));
  $('collapse').textContent='⌖';$('collapse').title=state.collapsed?'Open panel':'Hide panel';$('collapse').setAttribute('aria-label',$('collapse').title);$('collapse').setAttribute('aria-expanded',String(!state.collapsed));
  if(mode==='picker')renderCompactThreads();
  }, () => api.windowAction(mode)).then(() => {
    if(state.mode===mode) {if(mode==='quick')resetQuickIdle();else resetPanelIdle();chatgptLayout();}
  }).catch(error);
}
function collapse(value) {
  const mode=value?(state.mode==='expand'?'reveal':'idle'):'expand';
  return setMode(mode);
}
$('collapse').onclick=()=>{if(state.collapsed)switchPanel(state.activePanel);else collapse(true);};
$('bar-orb').onclick=()=>setMode('reveal');
$('always-top').onclick=()=>attempt(async()=>{const pinned=await api.windowAction('pin');state.settings.alwaysOnTop=Boolean(pinned);applySettings();});
$('panel-pin').onclick=()=>{
  if(state.settings.autoExpand===false)return;
  state.panelPinned=!state.panelPinned;$('panel-pin').classList.toggle('active',state.panelPinned);
  $('panel-pin').setAttribute('aria-pressed',String(state.panelPinned));$('panel-pin').title=state.panelPinned?'Unpin expanded panel':'Keep expanded panel open';
  resetPanelIdle();
};
let hoverTimer,quickIdleTimer;
function autoCollapseDelay() { const value=Number(state.settings.autoCollapseDelay);return Number.isFinite(value)&&value>=1000&&value<=120000?value:10000; }
function resetPanelIdle() {
  clearTimeout(hoverTimer);
  if(state.settings.autoExpand===false || window.DockLayoutTransition.busy || !['expand','reveal'].includes(state.mode) || (state.panelPinned && state.mode==='expand'))return;
  hoverTimer=setTimeout(()=>{
    if(window.DockLayoutTransition.busy || !['expand','reveal'].includes(state.mode) || (state.panelPinned && state.mode==='expand'))return;
    if(document.querySelector('dialog[open]') || state.chatgptSending || document.querySelector('.approval') || window.PetDockAttachments?.isBusy()){resetPanelIdle();return;}
    state.suppressHoverReveal=true;
    setMode(state.mode==='expand'?'reveal':'idle');
  },autoCollapseDelay());
}
function resetQuickIdle() {
  if(state.mode!=='quick')return;
  clearTimeout(quickIdleTimer);
  quickIdleTimer=setTimeout(function foldWhenReady(){
    if(state.mode!=='quick')return;
    if(window.PetDockAttachments?.isBusy()){quickIdleTimer=setTimeout(foldWhenReady,250);return;}
    persistDraft();state.suppressHoverReveal=true;setMode('idle');
  },autoCollapseDelay());
}
for(const event of ['pointermove','pointerdown','keydown','input','paste','wheel'])document.addEventListener(event,activity=>{
  if(activity.type==='pointermove' && state.suppressHoverReveal){state.suppressHoverReveal=false;if(activity.target.closest?.('#bar-orb'))pointerInside(true);}
  resetQuickIdle();
  if(['expand','reveal'].includes(state.mode))resetPanelIdle();
},{passive:true});
function pointerInside(inside) {
  state.pointerInside=inside;clearTimeout(hoverTimer);
  if(state.settings.autoExpand===false || window.DockLayoutTransition.busy)return;
  if(inside && state.mode==='idle') {if(!petPress && !state.suppressHoverReveal)hoverTimer=setTimeout(()=>{if(!petPress && state.mode==='idle')setMode('reveal');},120);return;}
  resetPanelIdle();
}
$('bar-orb').addEventListener('mouseenter',()=>pointerInside(true));
$('bar-orb').addEventListener('mouseleave',()=>{if(state.mode==='idle')clearTimeout(hoverTimer);});
document.querySelector('.toolbar').addEventListener('mouseenter',()=>pointerInside(true));
$('conversation-strip').addEventListener('mouseenter',()=>pointerInside(true));
$('conversation-strip').addEventListener('mouseleave',()=>{if(state.mode==='reveal')pointerInside(false);});
document.querySelector('.toolbar').addEventListener('mouseleave',()=>{if(state.mode==='reveal')pointerInside(false);});
$('dock').addEventListener('mouseleave',()=>{if(state.nativePointerInside!==true)pointerInside(false);});
function approval(event) { const box = document.createElement('div'); box.className = 'approval'; const heading = document.createElement('strong'); heading.textContent = 'Codex needs your approval'; const description = document.createElement('p'); description.textContent = event.params?.reason || event.params?.command || event.method; const detail = document.createElement('p'); detail.textContent = `Task: ${title(state.threads.find(t => t.id === event.params?.threadId))} (${event.params?.threadId || 'unknown'})\n${event.params?.cwd || ''}`; box.append(heading,description,detail); const supported = ['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(event.method); if (supported) for (const [label,decision] of [['Approve','accept'],['Decline','decline']]) { const button = document.createElement('button'); button.textContent = label; button.className = decision; button.onclick = () => attempt(async () => { await api.respond(event.id,{decision}); box.remove(); updateComposer(); }); box.append(button); } else { const text = document.createElement('p'); text.textContent = 'This request requires a response type not yet supported by the dock.'; box.append(text); } $('approvals').append(box); if (state.collapsed) collapse(false); updateComposer(); }
function setRuntime(threadId,runtime,outcome='completed') {
  state.attention ||= new Set();
  if(runtime.waitingForApproval || runtime.waitingForInput)state.attention.add(threadId);else state.attention.delete(threadId);
  if(state.running.has(threadId) && !runtime.running) {
    queueReaction(outcome==='failed'?'failed':'review');
  }
  if(runtime.running) state.running.set(threadId,runtime.turnId || 'desktop');else state.running.delete(threadId);
  if(threadId===state.selected?.id) $('desktop-approval').hidden=!(runtime.waitingForApproval || runtime.waitingForInput);
}
function desktopThread(params) {
  const thread=params.thread;if(!thread?.id)return;
  if(params.runtime)setRuntime(thread.id,params.runtime,thread.turns?.at(-1)?.status);
  const index=state.threads.findIndex(t=>t.id===thread.id);if(index>=0)state.threads[index]={...state.threads[index],...thread};else state.threads.unshift(thread);
  if(thread.id===state.selected?.id) {
    const follow=nearBottom(),position=$('messages').scrollTop;
    const items=(thread.turns || []).flatMap(turn=>turn.items || []),ids=new Set(items.map(item=>item.id));
    for(const [id,element] of state.messages)if(!ids.has(id)){element.remove();state.messages.delete(id);}
    for(const item of items)renderItem(item);
    if(follow)scrollBottom();else $('messages').scrollTop=position;
    $('activity').textContent=params.runtime?.running?'Codex is working…':'';
    $('desktop-approval').hidden=!(params.requestCount>0 || params.runtime?.waitingForApproval || params.runtime?.waitingForInput);
  }
  updateComposer();
}
$('desktop-approval').onclick=()=>attempt(()=>api.openCodex(state.selected?.id));
function onEvent(event) { if(event.type==='startup-error'){window.OgleDiagnostics.record(event.message,'Startup');return;} if(event.type==='chatgpt-interaction')return resetPanelIdle(); if(event.type==='chatgpt-activity') {state.chatgptWorking=event.state==='working';if(event.state==='done'||event.state==='failed')queueReaction(event.state==='failed'?'failed':'review');updateComposer();return;} if(event.type==='toggle-panel')return collapse(!event.expanded); if (event.type === 'request-close') return attempt(async()=>{await flushLocal();await api.windowAction('close');}); if(event.type==='settings-open') return switchPanel('settings'); if(event.type==='window/action') {if(event.action==='collapse')return collapse(true);if(event.action==='expand')return collapse(false);if(event.action==='settings')return switchPanel('settings');} if(event.type==='settings') {Object.assign(state.settings,event.settings || {});applySettings();return;} if (event.type === 'pointer') { state.nativePointerInside = event.inside; if(!event.inside)pointerInside(false); return; } if (event.type === 'connection') return setConnection(event.state,event.detail); if (event.type === 'request') return approval(event); if (event.type !== 'codex') return; if(event.method==='petdock/threadState') return desktopThread(event.params || {}); const p = event.params || {}, method = event.method; const threadId = p.threadId || p.thread?.id; if (method === 'turn/started') state.running.set(threadId,p.turn?.id); if (method === 'turn/completed') { state.running.delete(threadId); queueReaction(p.turn?.status==='failed'?'failed':'review'); } if (threadId && threadId !== state.selected?.id) { updateComposer(); return; } if (method === 'item/agentMessage/delta') { const old = state.messages.get(p.itemId)?.lastChild.textContent || ''; addMessage(p.itemId,'assistant',old + (p.delta || '')); } else if (method === 'item/started' || method === 'item/completed') { if (p.item) renderItem(p.item); } else if (method === 'turn/started') $('activity').textContent = 'Codex is working…'; else if (method === 'turn/completed') { $('activity').textContent = p.turn?.status === 'failed' ? 'Turn failed' : p.turn?.status === 'interrupted' ? 'Stopped' : 'Ready for your next prompt'; if (p.turn?.error) {if(state.mode==='expand' && state.activePanel==='chats')error(p.turn.error);else window.OgleDiagnostics.record(p.turn.error,'Codex turn');} } else if (method === 'error') {const issue=p.error || p.message || 'Codex reported an error';if(state.mode==='expand' && state.activePanel==='chats')error(issue);else window.OgleDiagnostics.record(issue,'Codex');} updateComposer(); }
const petImage = new Image(), canvas = $('pet'), context = canvas.getContext('2d');
function loadPet(pet) { if (!pet) return; petImage.src = pet.spriteUrl; save({petId:pet.id}); }
let pets = [];
const animations = {idle:[0,6,190],running:[7,6,140],waiting:[6,6,220],failed:[5,8,180],waving:[3,4,170],review:[8,6,190]};
let lastFrame=-1,lastGeneration=-1;
function animate(time) {
  if(state.reactionUntil && time>=state.reactionUntil && ['review','failed'].includes(state.petState))updatePetState();
  canvas.dataset.state=state.petState;
  const [row,count,duration]=animations[state.petState] || animations.idle;
  const frame=Math.floor(Math.max(0,time-state.animationStartedAt)/duration)%count,key=row*8+frame;
  canvas.dataset.frame=String(frame);canvas.dataset.generation=String(state.animationGeneration);
  if(petImage.complete && petImage.naturalWidth && (key!==lastFrame || lastGeneration!==state.animationGeneration)) {
    context.clearRect(0,0,192,208);const cellW=petImage.naturalWidth/8,cellH=petImage.naturalHeight/11;
    context.drawImage(petImage,frame*cellW,row*cellH,cellW,cellH,0,0,192,208);lastFrame=key;lastGeneration=state.animationGeneration;
  }
  requestAnimationFrame(animate);
}
petImage.onload=()=>{
  lastFrame=-1;
  if(typeof api.petIcon==='function') {
    const icon=document.createElement('canvas');icon.width=64;icon.height=64;
    const cellWidth=petImage.naturalWidth/8,cellHeight=petImage.naturalHeight/11,scale=Math.min(64/cellWidth,64/cellHeight);
    const width=cellWidth*scale,height=cellHeight*scale;
    icon.getContext('2d').drawImage(petImage,0,0,cellWidth,cellHeight,(64-width)/2,(64-height)/2,width,height);
    api.petIcon(icon.toDataURL('image/png')).catch(error);
  }
};petImage.onerror=()=>error('The selected pet sprite could not be loaded.');requestAnimationFrame(animate);
function clock() {
  const now = new Date(), values = [];
  if (state.settings.showTime !== false) values.push(now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:state.settings.timeFormat==='12h'}));
  if (state.settings.showDate) values.push(state.settings.dateFormat==='iso'?`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`:now.toLocaleDateString());
  $('clock').textContent = values.join(' · '); $('clock').hidden=!values.length;
  $('clock').title=now.toLocaleDateString([],{weekday:'long',year:'numeric',month:'long',day:'numeric'});
}
function applySettings() {
  document.documentElement.dataset.theme=state.settings.theme || 'dark';
  document.documentElement.style.setProperty('--pet-scale',String(state.settings.petScale || 1));
  $('panel-pin').hidden=state.settings.autoExpand===false;
  $('always-top').classList.toggle('active',state.settings.alwaysOnTop!==false);$('always-top').setAttribute('aria-pressed',String(state.settings.alwaysOnTop!==false));
  window.PetDockEditor?.applyTheme?.(state.settings.theme || 'dark');window.PetDockTerminal?.applyTheme?.(state.settings.theme || 'dark');
  if (state.settings.autoExpand === false) {state.panelPinned=false;$('panel-pin').classList.remove('active');$('panel-pin').setAttribute('aria-pressed','false');clearTimeout(hoverTimer);}
  document.querySelector('.sidebar').hidden=state.settings.sidebarVisible === false;
  for(const input of document.querySelectorAll('#settings-panel [data-setting]')) { const value=state.settings[input.dataset.setting];if(value!==undefined){if(input.type==='checkbox')input.checked=Boolean(value);else input.value=input.dataset.setting==='autoCollapseDelay'?value/1000:value;} }
  const chosen=pets.find(p=>p.id===state.settings.petId) || pets[0]; if(chosen && petImage.src!==chosen.spriteUrl) petImage.src=chosen.spriteUrl;
  clock();
  syncComposerContext();updateComposer();
  const nextDelay=autoCollapseDelay(),delayChanged=state.lastAutoCollapseDelay!==undefined && state.lastAutoCollapseDelay!==nextDelay;state.lastAutoCollapseDelay=nextDelay;
  const autoChanged=state.lastAutoExpand!==state.settings.autoExpand;state.lastAutoExpand=state.settings.autoExpand;
  if(delayChanged || autoChanged){if(state.mode==='quick')resetQuickIdle();else resetPanelIdle();}
}
clock();setInterval(clock,1000);
let refreshing=false;
setInterval(async()=>{
  if (!state.connected || refreshing || document.hidden) return;
  refreshing=true;
  try {
    const selectedId=state.selected?.id, version=selectionVersion;
    const listing=await api.listThreads({}); const recent=listing.data || listing.threads || listing || [];
    state.threads=[...recent,...state.threads.filter(t=>!recent.some(fresh=>fresh.id===t.id))]; renderProjects();renderThreads();
    if(selectedId && !state.running.has(selectedId)) {
      const result=await api.readThread(selectedId);
      if(version===selectionVersion && !state.running.has(selectedId)) for(const turn of (result.thread || result).turns || []) for(const item of turn.items || []) renderItem(item);
    }
  } catch(err) { window.OgleDiagnostics.record(err,'Background task refresh'); }
  finally {refreshing=false;}
},10000);
window.PetDockAttachments?.mount($('composer'),updateComposer);
api.onEvent(onEvent);
attempt(async () => {
  const boot=await api.boot(); state.settings=boot.settings || {}; pets=boot.pets || [];
  window.PetDockEditor?.mount($('editor-panel'),api,state.settings,save,error);
  window.PetDockShortcuts?.mount($('shortcuts-panel'),api,state.settings,save,error,()=>switchPanel('shortcuts'));
  window.PetDockTerminal?.mount($('terminal-panel'),api);
  window.PetDockSettings?.mount($('settings-panel'),api,state.settings,pets,save,applySettings,error,async()=>{const fresh=await api.boot();pets=fresh.pets || [];return pets;},()=>switchPanel('chatgpt'));
  state.threads=Array.isArray(boot.threads)?boot.threads:boot.threads?.data || [];state.cursor=boot.threads?.nextCursor;
  $('note').value=state.settings.note || '';applySettings();await setMode('idle');setConnection(boot.connection);renderProjects();renderThreads();$('load-more').hidden=!state.cursor;
  const previous=state.threads.find(t=>t.id===state.settings.lastThreadId);if(previous)await attempt(()=>selectThread(previous));
  if(!state.settings.compactChatTarget)await chooseCompactTarget();
});
