'use strict';
const $ = id => document.getElementById(id);
const state = { threads: [], settings: {}, selected: null, running: new Map(), messages: new Map(), cursor: null, connected: false, collapsed: true, mode:'idle', panelPinned: false, pinnedPanel:null, activePanel: 'chats', petState: 'idle', chatgptWorking:false, animationStartedAt:0, animationGeneration:0 };
const api = window.dock;
const codexQueue=new window.OgleCodexQueue({send:sendQueuedCodex,onChange:()=>updateComposer(),onError:err=>error(err)});
function error(err) { window.OgleDiagnostics.record(err); const box=$('error');box.replaceChildren();const message=document.createElement('span');message.textContent=window.OgleDiagnostics.friendly(err);const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Dismiss message');close.onclick=clearError;box.append(message,close);box.hidden=false; }
function clearError() { $('error').hidden = true; }
async function attempt(fn) { try { clearError(); return await fn(); } catch (err) { error(err); } }
let saveQueue = Promise.resolve();
function save(partial) { Object.assign(state.settings, partial); const pending = saveQueue.then(() => api.saveSettings(partial)); saveQueue = pending.catch(error); return pending; }
function title(thread) { return thread?.name || thread?.title || thread?.preview?.slice(0, 90) || 'Untitled task'; }
function basename(path) { return String(path || '').split(/[\\/]/).filter(Boolean).pop() || 'No project'; }
function setConnection(connection, detail) { detail ||= connection?.detail; const value = typeof connection === 'object' ? connection?.state : connection; state.connected = ['ready', 'connected','desktop'].includes(value); codexQueue.setConnected(state.connected); if(state.connected)refreshQueuedRuntime(); if (['error','disconnected'].includes(value)) state.running.clear(); if(detail && !state.connected)window.OgleDiagnostics.record(detail,'Codex connection'); $('status-dot').title=state.connected?'Codex connected':'Codex not connected'; $('status-dot').setAttribute('aria-label',$('status-dot').title); $('status-dot').className = state.connected ? 'ready' : ''; $('footer-status').textContent = '';  updateComposer(); }
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
  $('send').disabled=!!state.steering || !!state.chatgptSending || (!gpt && (!state.selected || !state.connected)) || (gpt && !!running) || (!$('prompt').value.trim() && !window.PetDockAttachments?.hasImages()) || !!window.PetDockAttachments?.isBusy();
  $('stop').hidden=gpt || !running;
  const queued=!gpt && (running || codexQueue.list(state.selected?.id).length);$('send').textContent=queued?'≡↑':'↑';$('send').title=queued?'Queue prompt':'Send prompt';$('send').setAttribute('aria-label',$('send').title);
  $('steer').hidden=gpt||!running;$('steer').disabled=$('send').disabled||running==='pending';
  codexQueue.render($('codex-queue'),gpt?'__chatgpt__':state.selected?.id);
  $('send-hint').textContent=!gpt && running?'Enter queues · Steer updates current turn':'Enter sends · Shift + Enter adds a line';
  $('composer-target').textContent=gpt?'ChatGPT · active conversation':state.selected?title(state.selected):'No task selected';
  $('conversation-name').textContent=compactUsesChatGPT()?'Write a prompt to ChatGPT...':state.selected?title(state.selected):'Choose a conversation';
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
    next=state.reactionUntil>performance.now()?state.reaction:'idle';
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
  for(const id of ['project-filter']) {
    const previous=$(id).value;$(id).replaceChildren(new Option('All projects',''));
    for(const cwd of projects)$(id).add(new Option(basename(cwd),cwd));$(id).value=previous;
  }
}
function renderCompactThreads() { window.OgleConversationPicker.render(); }
window.OgleConversationPicker.mount();
async function refresh(more = false) { const result = await api.listThreads(more ? {cursor:state.cursor} : {}); const threads = Array.isArray(result) ? result : result.data || result.threads || []; state.threads = more ? [...new Map([...state.threads,...threads].map(t=>[t.id,t])).values()] : threads; state.cursor = result.nextCursor; $('load-more').hidden = !state.cursor; renderProjects(); renderThreads(); }
function contentText(item) { if (typeof item.text === 'string') return item.text; if (Array.isArray(item.content)) return item.content.map(c => c.text || (c.type?.toLowerCase().includes('image') ? '[Image]' : '')).filter(Boolean).join('\n'); return item.aggregatedOutput || item.command || item.output || ''; }
function nearBottom() { const node = $('messages'); return node.scrollHeight-node.scrollTop-node.clientHeight < 70; }
function scrollBottom() { messageView.toBottom(); }
$('go-bottom').onclick = scrollBottom;
const messageView=new window.OgleMessages($('messages'),state.messages,()=>state.mode==='expand' && (state.activePanel==='chats' || state.pinnedPanel==='chats') && !window.DockLayoutTransition.busy);
function addMessage(id,role,text){messageView.set(id,role,text);}
function renderItem(item) { const type=item.type?.toLowerCase();if(type==='usermessage')addMessage(item.id,'user',contentText(item));else if(type==='agentmessage')addMessage(item.id,'assistant',contentText(item)); }

let selectionVersion = 0;
async function selectThread(thread) { const version = ++selectionVersion; if (state.selected) persistDraft(); state.selected = thread; syncComposerContext(); save({lastThreadId:thread.id}); $('thread-title').textContent = title(thread); $('thread-path').textContent = thread.cwd || 'No project folder'; $('pin-thread').disabled = false; $('pin-thread').textContent = (state.settings.pinnedThreads || []).includes(thread.id) ? '★' : '☆'; messageView.select(thread.id); $('activity').textContent = 'Loading conversation…'; renderThreads(); updateComposer(); const result = await api.readThread(thread.id); if (version !== selectionVersion) return; const full = result.thread || result; setRuntime(thread.id,result.runtime || historyRuntime(full),full.turns?.at(-1)?.status,full.turns?.at(-1)?.status!=='inProgress'?full.turns?.at(-1)?.id:undefined); for (const turn of full.turns || []) { for (const item of turn.items || []) renderItem(item); } $('activity').textContent = state.running.has(thread.id) ? 'Codex is working…' : ''; updateComposer(); }
function persistDraft() { if (state.composerContext) save({drafts:{...state.settings.drafts,[state.composerContext]:$('prompt').value}}); }
let draftTimer;
$('prompt').addEventListener('input', () => { updateComposer(); clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 350); });
$('prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); } });
async function refreshQueuedRuntime(){
  for(const id of new Set(codexQueue.list().map(entry=>entry.threadId))){
    try {const result=await api.readThread(id);if(!state.connected)return;const thread=result.thread || result,last=thread.turns?.at(-1);setRuntime(id,result.runtime || historyRuntime(thread),last?.status,last?.status!=='inProgress'?last?.id:undefined);}
    catch(err){window.OgleDiagnostics.record(err,'Queued task refresh');}
  }
}
function historyRuntime(thread){
  const last=thread.turns?.at(-1),flags=thread.status?.activeFlags || [];
  return {running:thread.status?.type?thread.status.type==='active':last?.status==='inProgress',turnId:last?.id,waitingForApproval:flags.includes('waitingOnApproval'),waitingForInput:flags.includes('waitingOnUserInput')};
}
async function sendQueuedCodex(entry){
  const {threadId,text,images}=entry;
  state.running.set(threadId,'pending');updateComposer();
  try {
    const result=await api.sendTurn(threadId,text,images),turn=result.turn || result;
    if(state.running.get(threadId)==='pending')state.running.set(threadId,turn.id || 'pending');
    if(state.selected?.id===threadId){
      if(![...messageView.items.values()].some(item=>item.role==='user'&&item.text===text))addMessage(entry.id,'user',text+(images.length?`\n[${images.length} attached image${images.length===1?'':'s'}]`:''));
      $('activity').textContent=state.running.has(threadId)?'Codex is working…':'';
    }
    return result;
  } catch(err){state.running.delete(threadId);queueReaction('failed');throw err;}
  finally{updateComposer();}
}
$('composer').onsubmit=event=>{
  event.preventDefault();if($('send').disabled)return;
  if(composerUsesChatGPT())return attempt(sendCompactChatGPT);
  attempt(async()=>{
    const thread=state.selected,text=$('prompt').value.trim(),images=window.PetDockAttachments?.getInputs() || [];
    codexQueue.enqueue({threadId:thread.id,title:title(thread),text,images});
    window.PetDockAttachments?.clear(thread.id,images);
    $('prompt').value='';persistDraft();updateComposer();
  });
};
$('steer').onclick=()=>attempt(async()=>{
  if($('steer').disabled)return;
  const thread=state.selected,text=$('prompt').value.trim(),images=window.PetDockAttachments?.getInputs() || [],turnId=state.running.get(thread.id);
  state.steering=true;updateComposer();
  try{
    await api.steerTurn(thread.id,text,images,turnId);
    window.PetDockAttachments?.clear(thread.id,images);
    if(state.composerContext===thread.id && $('prompt').value.trim()===text){$('prompt').value='';persistDraft();}
    else if((state.settings.drafts?.[thread.id]||'').trim()===text)await save({drafts:{...state.settings.drafts,[thread.id]:''}});
  }finally{state.steering=false;updateComposer();}
});
$('stop').onclick = () => attempt(() => api.interrupt(state.selected.id, state.running.get(state.selected.id)));
$('refresh').onclick = () => attempt(() => refresh()); $('load-more').onclick = () => attempt(() => refresh(true)); $('search').oninput = renderThreads; $('project-filter').onchange = renderThreads;
$('new-task').onclick = () => attempt(async () => { const cwd = await api.chooseFolder(); if (!cwd) return; const result = await api.startThread(cwd); const thread = result.thread || result; state.threads.unshift(thread); renderProjects(); await selectThread(thread); });
$('pin-thread').onclick = () => { if (!state.selected) return; const pins = new Set(state.settings.pinnedThreads || []); pins.has(state.selected.id) ? pins.delete(state.selected.id) : pins.add(state.selected.id); save({pinnedThreads:[...pins]}); $('pin-thread').textContent = pins.has(state.selected.id) ? '★' : '☆'; renderThreads(); };
let noteTimer; $('note').oninput = () => { $('note-status').textContent = 'Saving…'; clearTimeout(noteTimer); noteTimer = setTimeout(async () => { try { await save({note:$('note').value}); $('note-status').textContent = 'Saved locally'; } catch { $('note-status').textContent = 'Save failed'; } }, 400); };
function chatgptLayout() {
  const host = $('chatgpt-host'), visible = !window.DockLayoutTransition.busy && !state.collapsed && (state.activePanel === 'chatgpt' || state.pinnedPanel==='chatgpt');
  const rect = host.getBoundingClientRect();
  api.chatgptLayout({visible,bounds:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.max(1,Math.round(rect.width)),height:Math.max(1,Math.round(rect.height))}}).catch(error);
}
function switchPanel(name) {
  if(name!=='notes')window.OgleNotesZoom?.reset();
  if(name===state.pinnedPanel)name=name==='editor'?'terminal':'editor';
  messageView.remember();
  if(name!==state.activePanel)window.PetDockShortcuts?.discardEdit();
  state.activePanel = name;
  if (name === 'chatgpt') api.openChatGPT('show').then(chatgptLayout).catch(error);
  for (const button of document.querySelectorAll('[data-panel]')) button.classList.toggle('selected',button.dataset.panel === name);
  window.OglePinnedPanel.render();
  return setMode('expand').then(() => { chatgptLayout(); window.PetDockTerminal?.resize(); });
}
window.OglePinnedPanel.init({state,api,open:switchPanel,refresh:()=>{chatgptLayout();window.PetDockTerminal?.resize();messageView.schedule();},report:error});
for (const button of document.querySelectorAll('[data-panel]')) button.onclick = () => switchPanel(button.dataset.panel);
for (const button of document.querySelectorAll('[data-chatgpt-action]')) button.onclick = () => attempt(() => api.openChatGPT(button.dataset.chatgptAction));
window.addEventListener('resize', () => { chatgptLayout(); window.PetDockTerminal?.resize(); });
let petPress = null, draggedPet = false;
$('pet').addEventListener('pointerdown', event => {
  if (event.button !== 0 || window.DockLayoutTransition.busy) return;
  petPress = {x:event.screenX,y:event.screenY,lastX:event.screenX}; draggedPet = false;
  $('pet').setPointerCapture(event.pointerId);
  api.petDrag('start').catch(error);
});
$('pet').addEventListener('pointermove', event => {
  if (!petPress) return;
  if (Math.hypot(event.screenX-petPress.x,event.screenY-petPress.y)>5) draggedPet=true;
  if (draggedPet) {
    const dx=event.screenX-petPress.lastX;petPress.lastX=event.screenX;
    if(dx){const name=dx<0?'running-left':'running-right',now=performance.now();state.dragAnimation={name,startedAt:state.dragAnimation?.name===name?state.dragAnimation.startedAt:now,until:now+450};}
    clearTimeout(hoverTimer); api.petDrag('move').catch(error);
  }
});
$('pet').addEventListener('pointerup', event => {
  if (!petPress) return;
  petPress=null; const wasDragged=draggedPet; api.petDrag('end').then(result=>{if(!wasDragged && !result?.moved) return runPetClickAction();}).catch(error);
  if ($('pet').hasPointerCapture(event.pointerId)) $('pet').releasePointerCapture(event.pointerId);
});
$('pet').addEventListener('pointercancel',()=>{petPress=null;draggedPet=true;api.petDrag('end').catch(error);});
$('pet').onclick = event => { if(event.detail===0 && !draggedPet) attempt(runPetClickAction); };
$('pet').oncontextmenu = event => { event.preventDefault(); attempt(() => api.petMenu()); };
$('pet').onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); draggedPet=false; $('pet').click(); } };
$('pet').addEventListener('mouseenter',()=>{state.petHovered=true;state.hoverStartedAt=performance.now();updateComposer();});
$('pet').addEventListener('mouseleave',()=>{state.petHovered=false;updateComposer();});
async function flushLocal() {
  clearTimeout(noteTimer); clearTimeout(draftTimer);
  if (state.composerContext) await save({drafts:{...state.settings.drafts,[state.composerContext]:$('prompt').value}});
  await save({note:$('note').value}); await window.PetDockEditor?.flush();
}
$('sidebar-toggle').onclick=()=>{save({sidebarVisible:state.settings.sidebarVisible===false});applySettings();};
function setMode(mode) {
  if(state.pinnedPanel)mode='expand';
  if(mode!=='expand')window.OgleNotesZoom?.reset();
  window.OglePinnedPanel.hideMenu();
  messageView.remember();
  closeChatTargetMenu();
  if(mode!=='expand')window.PetDockShortcuts?.discardEdit();
  clearTimeout(hoverTimer);clearTimeout(panelIdleTimer);clearTimeout(quickIdleTimer);
  const previousMode=state.mode;
  state.mode=mode;state.collapsed=mode!=='expand';
  if(mode==='idle' && previousMode!=='idle')state.suppressHoverReveal=true;
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
  $('composer').hidden=!(mode==='quick' || (mode==='expand' && (state.activePanel==='chats' || state.pinnedPanel==='chats')));
  $('collapse').textContent='⌖';$('collapse').title=state.collapsed?'Open panel':'Hide panel';$('collapse').setAttribute('aria-label',$('collapse').title);$('collapse').setAttribute('aria-expanded',String(!state.collapsed));
  if(mode==='picker')renderCompactThreads();
  window.OglePinnedPanel.render();
  }, () => api.windowAction(mode), mode).then(() => {
    if(state.mode===mode) {if(mode==='quick')resetQuickIdle();else resetPanelIdle();chatgptLayout();messageView.schedule();}
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
let hoverTimer,panelIdleTimer,quickIdleTimer,lastPointerPosition;
function autoCollapseDelay() { const value=Number(state.settings.autoCollapseDelay);return Number.isFinite(value)&&value>=1000&&value<=120000?value:7000; }
function resetPanelIdle() {
  clearTimeout(panelIdleTimer);
  if(state.adminPromptPending || state.settings.autoExpand===false || window.DockLayoutTransition.busy || !['expand','reveal'].includes(state.mode) || (state.mode==='expand' && (state.pinnedPanel || state.panelPinned || state.pointerInside || state.nativePointerInside)))return;
  panelIdleTimer=setTimeout(()=>{
    if(state.adminPromptPending || window.DockLayoutTransition.busy || !['expand','reveal'].includes(state.mode) || (state.mode==='expand' && (state.pinnedPanel || state.panelPinned || state.pointerInside || state.nativePointerInside)))return;
    if(!$('panel-menu').hidden || document.querySelector('dialog[open]') || state.chatgptSending || document.querySelector('.approval') || window.PetDockAttachments?.isBusy()){resetPanelIdle();return;}
    state.suppressHoverReveal=true;
    setMode(state.mode==='expand'?'reveal':'idle');
  },autoCollapseDelay());
}
function resetQuickIdle() {
  if(state.mode!=='quick')return;
  clearTimeout(quickIdleTimer);
  if(state.adminPromptPending)return;
  quickIdleTimer=setTimeout(function foldWhenReady(){
    if(state.mode!=='quick'||state.adminPromptPending)return;
    if(window.PetDockAttachments?.isBusy()){quickIdleTimer=setTimeout(foldWhenReady,250);return;}
    persistDraft();state.suppressHoverReveal=true;setMode('idle');
  },autoCollapseDelay());
}
for(const event of ['pointermove','pointerdown','keydown','input','paste','wheel'])document.addEventListener(event,activity=>{
  if(activity.type==='pointermove'){
    state.petPointer={x:activity.clientX,y:activity.clientY};
    const position={x:activity.screenX,y:activity.screenY};
    const moved=lastPointerPosition && (position.x!==lastPointerPosition.x || position.y!==lastPointerPosition.y);
    lastPointerPosition=position;
    // Native resize/move can synthesize pointer events beneath a stationary cursor.
    // Only desktop-coordinate movement outside a transition counts as activity.
    if(!moved || window.DockLayoutTransition.busy)return;
    if(state.suppressHoverReveal){state.suppressHoverReveal=false;if(activity.target.closest?.('#bar-orb'))pointerInside(true,true);}
  }
  resetQuickIdle();
  if(['expand','reveal'].includes(state.mode))resetPanelIdle();
},{passive:true});
function pointerInside(inside,overOrb=false) {
  const changed=state.pointerInside!==inside;state.pointerInside=inside;clearTimeout(hoverTimer);
  if(state.mode==='expand' && changed)resetPanelIdle();
  if(state.settings.autoExpand===false || window.DockLayoutTransition.busy)return;
  if(inside && overOrb && state.mode==='idle') {if(!petPress && !state.suppressHoverReveal)hoverTimer=setTimeout(()=>{if(!petPress && state.mode==='idle')setMode('reveal');},120);return;}
  // Boundary events are often caused by the dock resizing, not by activity.
  // In compact modes they must not extend the independent collapse deadline.
}
$('bar-orb').addEventListener('mouseenter',()=>pointerInside(true,true));
$('bar-orb').addEventListener('mouseleave',()=>{if(state.mode==='idle')clearTimeout(hoverTimer);});
document.querySelector('.toolbar').addEventListener('mouseenter',()=>pointerInside(true));
$('conversation-strip').addEventListener('mouseenter',()=>pointerInside(true));
$('conversation-strip').addEventListener('mouseleave',()=>{if(state.mode==='reveal')pointerInside(false);});
document.querySelector('.toolbar').addEventListener('mouseleave',()=>{if(state.mode==='reveal')pointerInside(false);});
$('dock').addEventListener('mouseenter',()=>pointerInside(true));
$('dock').addEventListener('mouseleave',()=>{if(state.nativePointerInside!==true)pointerInside(false);});
function approval(event) { const box = document.createElement('div'); box.className = 'approval'; const heading = document.createElement('strong'); heading.textContent = 'Codex needs your approval'; const description = document.createElement('p'); description.textContent = event.params?.reason || event.params?.command || event.method; const detail = document.createElement('p'); detail.textContent = `Task: ${title(state.threads.find(t => t.id === event.params?.threadId))} (${event.params?.threadId || 'unknown'})\n${event.params?.cwd || ''}`; box.append(heading,description,detail); const supported = ['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(event.method); if (supported) for (const [label,decision] of [['Approve','accept'],['Decline','decline']]) { const button = document.createElement('button'); button.textContent = label; button.className = decision; button.onclick = () => attempt(async () => { await api.respond(event.id,{decision}); box.remove(); updateComposer(); }); box.append(button); } else { const text = document.createElement('p'); text.textContent = 'This request requires a response type not yet supported by the dock.'; box.append(text); } $('approvals').append(box); if (state.collapsed) collapse(false); updateComposer(); }
function setRuntime(threadId,runtime,outcome='completed',completedTurnId) {
  state.attention ||= new Set();
  if(runtime.waitingForApproval || runtime.waitingForInput)state.attention.add(threadId);else state.attention.delete(threadId);
  if(state.running.has(threadId) && !runtime.running) {
    queueReaction(outcome==='failed'?'failed':'review');
  }
  if(runtime.running) state.running.set(threadId,runtime.turnId || 'desktop');else state.running.delete(threadId);
  codexQueue.runtime(threadId,runtime,{completedTurnId});
  if(threadId===state.selected?.id) $('desktop-approval').hidden=!(runtime.waitingForApproval || runtime.waitingForInput);
}
function desktopThread(params) {
  const thread=params.thread;if(!thread?.id)return;
  if(params.runtime)setRuntime(thread.id,params.runtime,thread.turns?.at(-1)?.status,thread.turns?.at(-1)?.status!=='inProgress'?thread.turns?.at(-1)?.id:undefined);
  const index=state.threads.findIndex(t=>t.id===thread.id);if(index>=0)state.threads[index]={...state.threads[index],...thread};else state.threads.unshift(thread);
  if(thread.id===state.selected?.id) {
    const items=(thread.turns || []).flatMap(turn=>turn.items || []);
    if(!params.partial)messageView.reconcile(new Set(items.map(item=>item.id)));
    for(const item of items)renderItem(item);
    $('activity').textContent=state.running.has(thread.id)?'Codex is working…':'';
    $('desktop-approval').hidden=!(params.requestCount>0 || params.runtime?.waitingForApproval || params.runtime?.waitingForInput);
  }
  updateComposer();
}
$('desktop-approval').onclick=()=>attempt(()=>api.openCodex(state.selected?.id));
function onEvent(event) { if(event.type==='admin-prompt'){state.adminPromptPending=event.pending;resetPanelIdle();resetQuickIdle();return;} if(event.type==='toggle-chat-target')return attempt(toggleCompactChatTarget); if(event.type==='toggle-bar')return setMode(state.mode==='reveal'?'idle':'reveal'); if(event.type==='dock-shown'){resetPanelIdle();chatgptLayout();return;} if(event.type==='startup-error'){window.OgleDiagnostics.record(event.message,'Startup');return;} if(event.type==='chatgpt-interaction')return resetPanelIdle(); if(event.type==='chatgpt-activity') {state.chatgptWorking=event.state==='working';if(event.state==='done'||event.state==='failed')queueReaction(event.state==='failed'?'failed':'review');updateComposer();return;} if(event.type==='toggle-panel')return collapse(!event.expanded); if (event.type === 'request-close') return attempt(async()=>{await flushLocal();await api.windowAction('close');}); if(event.type==='settings-open') return switchPanel('settings'); if(event.type==='window/action') {if(event.action==='collapse')return collapse(true);if(event.action==='expand')return collapse(false);if(event.action==='settings')return switchPanel('settings');} if(event.type==='settings') {Object.assign(state.settings,event.settings || {});applySettings();return;} if (event.type === 'pointer') { state.nativePointerInside = event.inside;if(Number.isFinite(event.x)&&Number.isFinite(event.y))state.petPointer={x:event.x,y:event.y};if(state.mode==='expand' || !event.inside)pointerInside(event.inside); return; } if (event.type === 'connection') return setConnection(event.state,event.detail); if (event.type === 'request') return approval(event); if (event.type !== 'codex') return; if(/reasoning|commandExecution.*delta|tool.*delta/i.test(event.method || ''))return; if(event.method==='petdock/threadState') return desktopThread(event.params || {}); const p = event.params || {}, method = event.method; const threadId = p.threadId || p.thread?.id; if (method === 'turn/started') {state.running.set(threadId,p.turn?.id);codexQueue.runtime(threadId,{running:true,turnId:p.turn?.id});} if (method === 'turn/completed') { const active=state.running.get(threadId);if(p.turn?.id && active && !['pending','desktop'].includes(active) && active!==p.turn.id)return;state.running.delete(threadId); queueReaction(p.turn?.status==='failed'?'failed':'review');codexQueue.runtime(threadId,{running:false},{completed:!p.turn?.id,completedTurnId:p.turn?.id}); } if (threadId && threadId !== state.selected?.id) { updateComposer(); return; } if (method === 'item/agentMessage/delta') { const old = messageView.text(p.itemId); addMessage(p.itemId,'assistant',old + (p.delta || '')); } else if (method === 'item/started' || method === 'item/completed') { if (p.item) renderItem(p.item); } else if (method === 'turn/started') $('activity').textContent = 'Codex is working…'; else if (method === 'turn/completed') { $('activity').textContent = state.running.has(threadId)?'Codex is working…':p.turn?.status === 'failed' ? 'Turn failed' : p.turn?.status === 'interrupted' ? 'Stopped' : 'Ready for your next prompt'; if (p.turn?.error) {if(state.mode==='expand' && (state.activePanel==='chats' || state.pinnedPanel==='chats'))error(p.turn.error);else window.OgleDiagnostics.record(p.turn.error,'Codex turn');} } else if (method === 'error') {const issue=p.error || p.message || 'Codex reported an error';if(state.mode==='expand' && (state.activePanel==='chats' || state.pinnedPanel==='chats'))error(issue);else window.OgleDiagnostics.record(issue,'Codex');} updateComposer(); }
const petImage = new Image(), canvas = $('pet'), context = canvas.getContext('2d');
function loadPet(pet) { if (!pet) return; petImage.src = pet.spriteUrl; save({petId:pet.id}); }
let pets = [];
const animations = {idle:[0,6,190],'running-right':[1,8,100],'running-left':[2,8,100],running:[7,6,140],waiting:[6,6,220],failed:[5,8,180],waving:[3,4,170],review:[8,6,190]};
const idleAnimation=new window.OgleIdleAnimation();
let lastFrame=-1,lastGeneration=-1;
function animate(time) {
  if(state.reactionUntil && time>=state.reactionUntil && ['review','failed'].includes(state.petState))updatePetState();
  if(state.clickAnimation && (time>=state.clickAnimation.until || ['waiting','failed'].includes(state.petState)))state.clickAnimation=null;
  if(state.dragAnimation && time>=state.dragAnimation.until)state.dragAnimation=null;
  const watching=state.mode==='quick' && document.activeElement===$('prompt');
  // Interaction is a temporary visual overlay; the actual work state stays intact.
  const interaction=state.petState==='waiting'?null:state.dragAnimation || (state.petHovered?{name:'waving',startedAt:state.hoverStartedAt}:null) || (watching?{name:'watching'}:null);
  const flourish=interaction || state.clickAnimation || idleAnimation.tick(time,state.petState,animations);
  const visualState=flourish?.name || state.petState;
  canvas.dataset.state=visualState;
  let [row,count,duration]=animations[visualState] || animations.idle;
  let frame=Math.floor(Math.max(0,time-(flourish?.startedAt ?? state.animationStartedAt))/duration)%count;
  if(visualState==='watching') {
    const rect=canvas.getBoundingClientRect(),prompt=$('prompt').getBoundingClientRect();
    const pointer=state.petPointer || {x:prompt.x+prompt.width/2,y:prompt.y+prompt.height/2};
    const angle=(Math.atan2(pointer.x-(rect.x+rect.width/2),-(pointer.y-(rect.y+rect.height/2)))+Math.PI*2)%(Math.PI*2);
    const direction=Math.round(angle/(Math.PI/8))%16;
    row=9+Math.floor(direction/8);frame=direction%8;
  }
  const key=row*8+frame;
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
  window.OgleActivityStats?.configure(state.settings);
  document.documentElement.dataset.theme=state.settings.theme || 'dark';
  document.documentElement.style.setProperty('--pet-scale',String(state.settings.petScale || 1));
  $('panel-pin').hidden=state.settings.autoExpand===false;
  $('always-top').classList.toggle('active',state.settings.alwaysOnTop!==false);$('always-top').setAttribute('aria-pressed',String(state.settings.alwaysOnTop!==false));
  window.PetDockEditor?.applyTheme?.(state.settings.theme || 'dark');window.PetDockTerminal?.applyTheme?.(state.settings.theme || 'dark');
  if (state.settings.autoExpand === false) {state.panelPinned=false;$('panel-pin').classList.remove('active');$('panel-pin').setAttribute('aria-pressed','false');clearTimeout(hoverTimer);clearTimeout(panelIdleTimer);}
  document.querySelector('.sidebar').hidden=state.settings.sidebarVisible === false;
  for(const input of document.querySelectorAll('#settings-panel [data-setting]')) { const value=state.settings[input.dataset.setting];if(value!==undefined){if(input.type==='checkbox')input.checked=Boolean(value);else input.value=input.dataset.setting==='autoCollapseDelay'?value/1000:value;} }
  const chosen=pets.find(p=>p.id===state.settings.petId) || pets[0]; if(chosen && petImage.src!==chosen.spriteUrl) petImage.src=chosen.spriteUrl;
  window.OglePinnedPanel.configure();
  clock();
  const clickLabels={codex:'Open Codex',animation:'Play random animation',expand:'Open full panel',reveal:'Show horizontal bar',toggle:'Toggle full panel',chatgpt:'Open ChatGPT panel',none:'Drag to move'};
  $('pet').title=clickLabels[state.settings.petClickAction] || clickLabels.reveal;$('pet').setAttribute('aria-label',$('pet').title);
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
mountChatTargetMenu();
api.onEvent(onEvent);
attempt(async () => {
  const boot=await api.boot(); state.settings=boot.settings || {}; pets=boot.pets || [];
  window.OgleActivityStats?.init(api,state.settings);
  window.PetDockEditor?.mount($('editor-panel'),api,state.settings,save,error);
  window.PetDockShortcuts?.mount($('shortcuts-panel'),api,state.settings,save,error,()=>switchPanel('shortcuts'));
  window.PetDockTerminal?.mount($('terminal-panel'),api);
  window.PetDockSettings?.mount($('settings-panel'),api,state.settings,pets,save,applySettings,error,async()=>{pets=await api.listPets();applySettings();return pets;},()=>switchPanel('chatgpt'));
  state.threads=Array.isArray(boot.threads)?boot.threads:boot.threads?.data || [];state.cursor=boot.threads?.nextCursor;
  $('note').value=state.settings.note || '';applySettings();await setMode('idle');setConnection(boot.connection);renderProjects();renderThreads();$('load-more').hidden=!state.cursor;
  const previous=state.threads.find(t=>t.id===state.settings.lastThreadId);if(previous)await attempt(()=>selectThread(previous));
  if(!state.settings.compactChatTarget)await chooseCompactTarget();
});

window.addEventListener('blur',()=>window.PetDockShortcuts?.discardEdit());

for(const event of ['pointerdown','focusin'])document.addEventListener(event,activity=>{if((state.activePanel==='shortcuts' || state.pinnedPanel==='shortcuts') && !activity.target.closest?.('#shortcuts-panel'))window.PetDockShortcuts?.discardEdit();},true);
