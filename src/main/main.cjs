'use strict';
const { app, BrowserWindow, ipcMain, dialog, screen, Notification, shell, Menu, net, nativeImage, globalShortcut, clipboard, Tray } = require('electron');
if (process.argv.includes('--persistent-terminal-worker')) { require('./persistent-admin-worker.cjs').runPersistentWorker(); return; }
if (process.argv.includes('--terminal-worker')) { require('./terminal-worker.cjs').runWorker(); return; }
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createDockTray, installTrayOnlyWindows } = require('./tray.cjs');
const { TopmostController } = require('./topmost-controller.cjs');
const { DockShortcuts, shortcutKeys } = require('./global-shortcuts.cjs');
const { createActivityStats } = require('./activity-stats.cjs');
const { SettingsStore } = require('./settings.cjs');
const { GracefulShutdown } = require('./shutdown.cjs');
const { CodexBridge } = require('./codex-bridge.cjs');
const { ClaudeBridge } = require('./claude-bridge.cjs');
const { ChatGPTPanel } = require('./chatgpt-panel.cjs');
const { ClaudeWebPanel } = require('./claude-web-panel.cjs');
const { historyMenuTemplate } = require('./history-menu.cjs');
const { sendChatGPT } = require('./chatgpt-composer.cjs');
const { pasteChatGPTDraft } = require('./chatgpt-draft.cjs');
const { selectionMenuTemplate } = require('./selection-menu.cjs');
const { DockFiles } = require('./files.cjs');
const windowsTools=require('./windows-tools.cjs').createWindowsTools();
const fileSearch=require('./file-search.cjs').createFileSearch({includeFixedDrives:true,dataDir:()=>app.getPath('userData'),roots:()=>['desktop','documents','downloads','pictures','music','videos'].map(name=>app.getPath(name))});
const { TerminalManager } = require('./terminal-manager.cjs');
const { PetLibrary, recommendedPets } = require('./pet-library.cjs');
const { dockBounds, petCenter, clampPet } = require('./window-layout.cjs');
const { WindowTransition } = require('./window-transition.cjs');
const {configureStartup,ensureCodex}=require('./startup.cjs');


installTrayOnlyWindows(app,BrowserWindow);
app.setName('Ogle');
// Preserve existing profiles, browser sign-ins and the single Windows startup entry.
app.setAppUserModelId('PetDock.Desktop');
app.setPath('userData', process.env.PETDOCK_DATA_DIR ? path.resolve(process.env.PETDOCK_DATA_DIR) : path.join(app.getPath('appData'), 'PetDock'));
if (!app.requestSingleInstanceLock()) {app.quit();return;}
let tray, shutdown, activityStats, shortcuts, win, bridge, claude, chatgpt, claudeWeb, store, files, terminals, petLibrary, petDragState, pointerTimer, connection = { state: 'connecting', detail: 'Connecting to Codex…' }, connectionPromise;
const root = path.resolve(__dirname, '../..');
const indexPath = path.join(root, 'src/renderer/index.html');
const indexUrl = pathToFileURL(indexPath).href;
const {normalizeRegions,containsPoint}=require('./window-shape.cjs');
let inputRegions=null,topmost,contentFullscreen=false,restoreDockBounds=null;
let expanded = false;
let pinnedPanelSide = null;
let layoutMode = 'idle';
function showDock() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus(); send({type:'dock-shown'});
}
function hideDock() { if (win && !win.isDestroyed()) { chatgpt?.hide(); claudeWeb?.hide(); win.hide(); } }
app.on('second-instance', showDock);
function send(payload) { if (win && !win.isDestroyed()) win.webContents.send('dock:event', payload); }
function showSelectionMenu(text){
  Menu.buildFromTemplate(selectionMenuTemplate(text,{copy:value=>clipboard.writeText(value),paste:payload=>send({type:'selection-paste',...payload})})).popup({window:win});return true;
}
let composerBusy=false;
async function withChatGPTComposer(action){
  if(composerBusy)throw new Error('A ChatGPT draft or send is already in progress.');
  composerBusy=true;try{return await action();}finally{composerBusy=false;}
}
let pendingAdminOperations=0;
async function withAdminPrompt(action){
  pendingAdminOperations++;topmost?.setSuspended(true);send({type:'admin-prompt',pending:true});
  try{return await action();}
  finally{pendingAdminOperations--;topmost?.setSuspended(pendingAdminOperations>0);send({type:'admin-prompt',pending:pendingAdminOperations>0});}
}
function string(value, label, max = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${label}`);
  return value;
}
function register(name, handler) {
  ipcMain.handle(`dock:${name}`, (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== indexUrl) throw new Error('Untrusted request');
    return handler(...args);
  });
}
function pets() { return petLibrary.list(); }
async function updatePetIcon(){const icon=nativeImage.createFromPath(path.join(root,'assets/ogle.png'));if(!icon.isEmpty()&&!win.isDestroyed())win.setIcon(icon);}
function resize(mode = layoutMode) {
  if(contentFullscreen)return;
  if(typeof mode==='boolean')mode=mode?'expand':'idle';
  if(mode==='collapse')mode='idle';
  layoutMode=mode;
  expanded = mode==='expand';
  const bounds = win.getBounds();
  const area = screen.getDisplayNearestPoint(petCenter(bounds,store?.value.petScale || 1)).workArea;
  const scale = store?.value.petScale || 1;
  if (!expanded) {chatgpt?.hide();claudeWeb?.hide();}
  const next=dockBounds(mode,bounds,area,scale,pinnedPanelSide);
  if(['x','y','width','height'].some(key=>next[key]!==bounds[key]))win.setBounds(next);
}
async function connected() { if(store.value.useCodex===false)throw new Error('Enable Codex in Settings → Assistants.'); await connectionPromise; if (connection.state === 'error') throw new Error(connection.detail); }
app.whenReady().then(async () => {
  store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
  configureStartup(app,store.value.autoStart);
  if(process.argv.includes('--autostart')&&store.value.useCodex!==false&&!process.env.PETDOCK_DATA_DIR)ensureCodex({open:url=>shell.openExternal(url)}).catch(error=>send({type:'startup-error',message:error.message}));
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({ title: 'Ogle', width: Math.min(600, area.width), height: Math.min(200, area.height), x: area.x + Math.max(0, area.width - 620), y: area.y + Math.max(0, area.height - 220), transparent: true, frame: false, resizable: false, skipTaskbar: true, backgroundColor: '#00000000', alwaysOnTop: store.value.alwaysOnTop, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.on('minimize', hideDock);
  win.on('hide',()=>send({type:'dock-visibility',visible:false}));
  win.on('show',()=>send({type:'dock-visibility',visible:true}));
  topmost=new TopmostController(win,{enabled:store.value.alwaysOnTop,children:()=>[...(chatgpt?.children||[]),...(claudeWeb?.children||[])]});
  shutdown=new GracefulShutdown({window:win,
    flush:()=>win.webContents.executeJavaScript("typeof state==='undefined' || !state.bootReady ? true : flushLocal().then(()=>true,err=>{error(err);return false;})"),
    report:problem=>{if(!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.executeJavaScript(`error(${JSON.stringify(problem.message)})`).catch(()=>{});}
  });
  win.on('close',event=>{
    if(shutdown.ready)return;
    event.preventDefault();shutdown.request().then(ok=>{if(ok)app.quit();});
  });
  // Native stage dragging follows the same pet-only boundary as pet dragging.
  win.on('will-move',(event,bounds)=>{
    if(contentFullscreen)return;
    const scale=store.value.petScale || 1,area=screen.getDisplayNearestPoint(petCenter(bounds,scale)).workArea;
    const next=clampPet(bounds,area,scale);
    if(next.x!==bounds.x || next.y!==bounds.y){event.preventDefault();win.setPosition(next.x,next.y);}
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (url !== indexUrl) event.preventDefault(); });
  chatgpt = new ChatGPTPanel({ parent: win,onChildWindow:()=>topmost.request(),onZoom:factor=>send({type:'chatgpt-zoom',factor}),onExitFullscreen:()=>{if(!contentFullscreen)return false;send({type:'exit-panel-fullscreen'});return true;}, getBounds: () => win.getBounds(), onStatus: status => send({ type: 'chatgpt', ...status }),onActivity: activity=>send({type:'chatgpt-activity',...activity}),onInteraction:()=>send({type:'chatgpt-interaction'}),onFindOpen:()=>send({type:'chat-find-open',target:'chatgpt'}),onCommandsOpen:()=>send({type:'commands-open',target:'chatgpt'}),onSelectionMenu:text=>{try{showSelectionMenu(text);}catch(error){send({type:'startup-error',message:error.message});}},onFindResult:result=>send({type:'chatgpt-find-result',result}) });
  tray=createDockTray({Tray,Menu,nativeImage,iconPath:path.join(root,'assets/ogle.png'),window:win,onShow:showDock,onHide:hideDock,onSettings:()=>{showDock();send({type:'settings-open'});},onQuit:()=>app.quit()});
  register('panelFullscreen',enabled=>{if(typeof enabled!=='boolean')throw new Error('Invalid fullscreen mode');if(enabled===contentFullscreen)return;contentFullscreen=enabled;if(enabled){restoreDockBounds=win.getBounds();win.setBounds(screen.getDisplayMatching(restoreDockBounds).bounds);}else{if(restoreDockBounds)win.setBounds(restoreDockBounds);restoreDockBounds=null;}topmost.request();return win.getBounds();});
  claudeWeb=new ClaudeWebPanel({parent:win,onChildWindow:()=>topmost.request(),onStatus:status=>send({type:'claude-web-status',...status}),onActivity:activity=>send({type:'claude-web-activity',...activity}),onInteraction:()=>send({type:'claude-web-interaction'}),onZoom:factor=>send({type:'claude-web-zoom',factor}),onFindOpen:()=>send({type:'chat-find-open',target:'claude-web'}),onFindResult:result=>send({type:'claude-web-find-result',result}),onCommandsOpen:()=>send({type:'commands-open',target:'claude-web'}),onSelectionMenu:text=>showSelectionMenu(text),onExitFullscreen:()=>{if(!contentFullscreen)return false;send({type:'exit-panel-fullscreen'});return true;}});
  register('openClaudeWeb',action=>{if(store.value.useClaudeWeb!==true)throw new Error('Enable Claude in Settings - Assistants.');return claudeWeb.show(action);});
  register('claudeWebLayout',layout=>claudeWeb.layout(layout));
  register('claudeWebZoom',factor=>claudeWeb.setZoom(factor));
  register('claudeWebFind',(query,options)=>claudeWeb.find(query,options));
  register('claudeWebStopFind',()=>claudeWeb.stopFind());
  register('chatgptZoom',factor=>chatgpt.setZoom(factor));
  register('windowShape',rects=>{const b=win.getBounds();inputRegions=normalizeRegions(rects,b.width,b.height);if(inputRegions.length)win.setShape(inputRegions);return true;});
  const openShortcutPanel=panel=>{if(win.isMinimized())win.restore();win.show();win.focus();send({type:'open-panel-shortcut',panel});};
  shortcuts=new DockShortcuts(globalShortcut,{
    shortcutCodex:()=>openShortcutPanel('chats'),shortcutGpt:()=>openShortcutPanel('chatgpt'),shortcutClaude:()=>openShortcutPanel('claude'),shortcutEditor:()=>openShortcutPanel('editor'),shortcutShell:()=>openShortcutPanel('terminal'),shortcutLinks:()=>openShortcutPanel('shortcuts'),
    shortcutPrompt:()=>{if(win.isMinimized())win.restore();win.show();win.focus();send({type:'focus-prompt-shortcut'});},
    shortcutVisibility:()=>{if(win.isVisible()&&!win.isMinimized())hideDock();else showDock();},
    shortcutChatTarget:()=>{if(win.isMinimized())win.restore();win.show();win.focus();send({type:'toggle-chat-target'});},
    shortcutBar:()=>{if(win.isMinimized())win.restore();win.show();win.focus();send({type:'toggle-bar'});},
    shortcutPanel:()=>{if(win.isMinimized())win.restore();win.show();win.focus();send({type:'toggle-panel',expanded:!expanded});}
  });
  try{shortcuts.configure(store.value);}catch(error){send({type:'startup-error',message:error.message});}
  activityStats=createActivityStats({dataDir:app.getPath('userData'),onUpdate:data=>send({type:'activity-stats',...data}),onError:error=>send({type:'startup-error',message:error.message})});
  activityStats.configure(store.value);
  register('recommendedPets',()=>recommendedPets);
  register('activityStats',()=>activityStats.snapshot());
  files = new DockFiles(win);
  petLibrary = new PetLibrary(path.join(root,'assets/pets'),{destination:path.join(app.getPath('userData'),'pets'),fetcher:(...args)=>net.fetch(...args)});
  await petLibrary.refresh();
  await updatePetIcon();
  terminals = new TerminalManager({ packaged:app.isPackaged && !process.env.PETDOCK_DATA_DIR,onEvent: send, executable: process.execPath, workerArgs: app.isPackaged ? [] : [app.getAppPath()] });
  let lastInside,lastPointerX,lastPointerY;
  pointerTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint(), b = win.getBounds();
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height && (!inputRegions || containsPoint(inputRegions,p.x-b.x,p.y-b.y));
    const x=p.x-b.x,y=p.y-b.y;
    if (inside !== lastInside || x!==lastPointerX || y!==lastPointerY) { lastInside=inside;lastPointerX=x;lastPointerY=y;send({type:'pointer',inside,x,y}); }
  }, 160);
  claude=new ClaudeBridge({dataDir:app.getPath('userData'),onEvent:send});
  const requireClaude=()=>{if(store.value.useClaude!==true)throw new Error('Enable Claude in Settings - Assistants.');};
  register('claudeStatus',()=>claude.status());
  register('claudeListThreads',()=>{requireClaude();return claude.listThreads();});
  register('claudeCreate',options=>{requireClaude();return claude.create(options);});
  register('claudeWrite',(id,data)=>{requireClaude();return claude.write(string(id,'Claude session'),data);});
  register('claudeResize',(id,cols,rows)=>claude.resize(string(id,'Claude session'),cols,rows));
  register('claudeClose',id=>claude.close(string(id,'Claude session')));
  bridge = new CodexBridge();
  const providerBridge=provider=>{if(provider==='codex')return bridge;if(provider==='claude')return claude;throw new Error('Invalid assistant');};
  register('historyMenu',target=>new Promise(resolve=>{const template=historyMenuTemplate(target).map(({action,...item})=>action?{...item,click:()=>resolve(action)}:item);Menu.buildFromTemplate(template).popup({window:win,callback:()=>resolve(null)});}));
  register('renameConversation',async(provider,id,name)=>{const target=providerBridge(provider);if(provider==='codex')await connected();return target.renameThread(string(id,'Conversation'),name);});
  register('removeConversation',async(provider,id)=>{
    const target=providerBridge(provider);id=string(id,'Conversation');const choice=await dialog.showMessageBox(win,{type:'question',message:'Move this conversation to the archive?',detail:'You can restore it from Archived conversations in the right-click menu. Your project folder and files remain in place.',buttons:['Cancel','Move to archive'],defaultId:0,cancelId:0});
    if(choice.response!==1)return {cancelled:true};if(provider==='codex'){await connected();await target.archiveThread(string(id,'Conversation'));}else await target.removeThread(string(id,'Conversation'));return {cancelled:false};
  });
  register('listArchivedConversations',async provider=>{const target=providerBridge(provider);if(provider==='claude')return target.listArchivedThreads();await connected();const threads=[],seen=new Set();let cursor;do{const result=await target.listThreads({archived:true,cursor});threads.push(...(result.data||result.threads||[]));cursor=result.nextCursor||result.next_cursor;if(cursor&&seen.has(cursor))throw new Error('Could not load the remaining archived conversations.');if(cursor)seen.add(cursor);}while(cursor);return {threads};});
  register('restoreConversation',async(provider,id)=>{const target=providerBridge(provider);if(provider==='codex'){await connected();return target.unarchiveThread(string(id,'Conversation'));}return target.restoreThread(string(id,'Conversation'));});

  bridge.on('thread-opened', threadId => send({ type: 'codex-thread-opened', threadId }));
  // Cache session observations that can precede renderer subscription/load.
  const bootActivity = new Map();
  bridge.on('activity', activity => {
    bootActivity.delete(activity.threadId);bootActivity.set(activity.threadId,activity);
    if(bootActivity.size>256)for(const [id,value] of bootActivity){if(!value.running)bootActivity.delete(id);if(bootActivity.size<=256)break;}
    send({ type: 'codex-activity', ...activity });
  });
  const desktopActivity = new Map();
  bridge.on('status', status => { if(['error','disconnected'].includes(status.state))bootActivity.clear();connection = status; send({ type: 'connection', ...status }); });
  bridge.on('notification', event => {
    send({ type: 'codex', ...event });
    let desktopFinished = false;
    if(event.method==='petdock/threadState' && event.params?.thread?.id) {
      const id=event.params.thread.id,running=event.params.runtime?.running;
      desktopFinished=desktopActivity.get(id)===true && running===false;
      desktopActivity.set(id,running);
    }
    if ((event.method === 'turn/completed' || desktopFinished) && !win.isFocused() && Notification.isSupported()) {
      const failed = (event.params?.turn || event.params?.thread?.turns?.at(-1))?.status === 'failed';
      new Notification({ title: failed ? 'Ogle · task failed' : 'Ogle · task finished', body: 'Open your dock to view the response.' }).show();
    }
  });
  bridge.on('request', event => send({ type: 'request', ...event }));
  bridge.on('error', error => { connection = { state: 'error', detail: error.message }; send({ type: 'connection', ...connection }); });
  connectionPromise = (store.value.useCodex!==false?bridge.connect():Promise.resolve(connection={state:'disabled'})).catch(error => { connection = { state: 'error', detail: error.message }; send({ type: 'connection', ...connection }); });
  register('boot', async () => {
    await connectionPromise;
    let threads = { data: [], nextCursor: null };
    try { if(store.value.useCodex!==false)threads = await bridge.listThreads(); } catch (error) { connection = { ...connection, detail: error.message }; }
    return { threads, pets: await pets(), settings: store.value, connection, activity:[...bootActivity.values()] };
  });
  register('listModels',async()=>{await connected();return bridge.listModels();});
  register('listThreads', async (filters = {}) => { await connected(); return bridge.listThreads(filters); });
  register('readThread', async (id, options) => { await connected(); return bridge.readThread(string(id, 'task ID'), options); });
  register('startThread', async cwd => {
    await connected(); string(cwd, 'project folder');
    if (!path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Choose an existing project folder');
    return bridge.startThread(cwd);
  });
  register('sendTurn', async (id, text, images=[], options={}) => { await connected(); if(typeof text!=='string'||text.length>200000)throw new Error('Invalid prompt');return bridge.sendTurn(string(id, 'task ID'),text,images,options); });
  register('steerTurn', async(id,text,images=[],expectedTurnId)=>{await connected();if(typeof text!=='string'||text.length>200000)throw new Error('Invalid prompt');return bridge.steerTurn(string(id,'task ID'),text,images,expectedTurnId);});
  register('interrupt', (id, turnId) => bridge.interrupt(string(id, 'task ID'), string(turnId, 'turn ID')));
  register('respond', (id, result) => bridge.respond(id, result));
  register('saveSettings', async patch => { const previous=store.value,changedShortcuts=shortcutKeys.some(key=>Object.hasOwn(patch,key));if(changedShortcuts)shortcuts.configure({...previous,...patch});let result;try{result=store.update(patch);}catch(error){if(changedShortcuts)shortcuts.configure(previous);throw error;}activityStats.configure(result);if(Object.hasOwn(patch,'useCodex') && result.useCodex!==previous.useCodex){if(result.useCodex)connectionPromise=bridge.connect().catch(error=>{connection={state:'error',detail:error.message};send({type:'connection',...connection});});else bridge.close();}if(Object.hasOwn(patch,'petScale'))resize();if(Object.hasOwn(patch,'alwaysOnTop'))topmost.setEnabled(result.alwaysOnTop);if(Object.hasOwn(patch,'autoStart'))configureStartup(app,result.autoStart);if(Object.hasOwn(patch,'petId'))await updatePetIcon();return result; });
  register('chooseFolder', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Choose a project folder' });
    return result.canceled ? null : result.filePaths[0];
  });
  register('openChatGPT', action => {if(store.value.useChatGPT===false)throw new Error('Enable ChatGPT in Settings - Assistants.');return chatgpt.show(action);});
  register('selectionMenu',text=>showSelectionMenu(text));
  register('chatgptSend', payload => withChatGPTComposer(async () => {
    await chatgpt.show();
    const contents=chatgpt.view.webContents,deadline=Date.now()+10000;
    while(!contents.isDestroyed() && contents.isLoadingMainFrame() && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    return sendChatGPT(contents,payload);
  }));
  register('chatgptPaste', text => withChatGPTComposer(async()=>{
    await chatgpt.show();const contents=chatgpt.view.webContents,deadline=Date.now()+10000;
    while(!contents.isDestroyed() && contents.isLoadingMainFrame() && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    return pasteChatGPTDraft(contents,text);
  }));
  register('chatgptLayout', layout => chatgpt.layout(layout));
  register('chatgptFind', (query, options) => chatgpt.find(query, options));
  register('chatgptStopFind', () => chatgpt.stopFind());
  register('openCodex', async id => {
    const threadId = id ? string(id, 'task ID') : null;
    await shell.openExternal(threadId ? `codex://threads/${encodeURIComponent(threadId)}` : 'codex://');
    if (threadId) send({ type: 'codex-thread-opened', threadId });
  });
  register('petDrag', action => {
    if(action==='start'){petDragState={pointer:screen.getCursorScreenPoint(),bounds:win.getBounds(),moved:false};return {moved:false};}
    if(!petDragState)return {moved:false};
    const p=screen.getCursorScreenPoint(),dx=p.x-petDragState.pointer.x,dy=p.y-petDragState.pointer.y;
    if((action==='move' || action==='end' && Math.hypot(dx,dy)>5) && (Math.abs(dx)>3||Math.abs(dy)>3)) {
      petDragState.moved=true;const b=petDragState.bounds;
      const area=screen.getDisplayNearestPoint(p).workArea;
      const next=clampPet({...b,x:b.x+dx,y:b.y+dy},area,store.value.petScale || 1);
      const current=win.getBounds();if(current.x!==next.x || current.y!==next.y)win.setPosition(next.x,next.y);
    }
    const moved=petDragState.moved;if(action==='end')petDragState=null;return {moved};
  });
  register('petMenu',()=>{Menu.buildFromTemplate([
    {label:'Open Codex',click:()=>shell.openExternal('codex://')},
    {label:expanded?'Collapse dock':'Expand dock',click:()=>send({type:'toggle-panel',expanded:!expanded})},
    {label:'Show metrics',type:'checkbox',checked:store.value.statsVisible!==false,click:item=>{store.update({statsVisible:item.checked});activityStats.configure(store.value);send({type:'settings',settings:store.value});}},
    {label:'Commands…',accelerator:'Control+Shift+P',click:()=>send({type:'commands-open'})},
    {label:'Settings',click:()=>send({type:'settings-open'})},
    {label:'Always on top',type:'checkbox',checked:store.value.alwaysOnTop,click:item=>{topmost.setEnabled(item.checked);store.update({alwaysOnTop:item.checked});send({type:'settings',settings:store.value});}},
    {type:'separator'},
    {label:'Hide Ogle',click:hideDock},
    {label:'Quit Ogle',click:()=>send({type:'request-close'})}
  ]).popup({window:win});return true;});
  register('listPets',()=>pets());
  register('refreshPets',async()=>{const result=await petLibrary.refresh();await updatePetIcon();return result;});
  register('petIcon',data=>{
    if(typeof data!=='string'||data.length>180000||!data.startsWith('data:image/png;base64,'))throw new Error('Invalid pet icon');
    const icon=nativeImage.createFromDataURL(data),size=icon.getSize();
    if(icon.isEmpty()||size.width>256||size.height>256)throw new Error('Invalid pet icon dimensions');
    return false; // Retained IPC compatibility; the application uses its own fixed icon.
  });
  register('installPet',input=>petLibrary.install(input));
  register('codexAccount',()=>bridge.accountRead());
  register('codexLogin',async()=>{const result=await bridge.login();if(result.authUrl)await shell.openExternal(result.authUrl);return result;});
  register('codexLogout',async()=>{
    const result=await dialog.showMessageBox(win,{type:'question',message:'Sign out of the local Codex account?',detail:'The local Codex login can also be used by your other Codex clients.',buttons:['Cancel','Sign out'],defaultId:0,cancelId:0});
    if(result.response===1)return bridge.logout();return {cancelled:true};
  });
  register('clipboardReadText',()=>clipboard.readText());
  register('clipboardWriteText',text=>{if(typeof text!=='string'||text.length>5*1024*1024)throw new Error('Invalid clipboard text');clipboard.writeText(text);return true;});
  register('editorOpen', () => files.open());
  register('editorSave', options => files.save(options));
  register('chooseShortcut', kind => files.chooseShortcut(kind));
  register('importShortcuts', payload => files.importShortcuts(payload));
  register('shortcutIcons', paths=>files.shortcutIcons(paths));
  register('openShortcut', target => files.openShortcut(target));
  register('runCommand', value => windowsTools.runCommand(value));
  register('listWindowsTools', () => windowsTools.listTools());
  register('openWindowsTool', id => windowsTools.runTool(id));
  register('searchFiles', (query,options) => fileSearch.search(query,options));
  register('readDirectory', target => files.readDirectory(target));
  register('terminalCreate', options => options?.admin?withAdminPrompt(()=>terminals.create(options)):terminals.create(options));
  register('terminalWrite', (id, data) => terminals.write(id, data));
  register('terminalResize', (id, cols, rows) => terminals.resize(id, cols, rows));
  register('terminalClose', id => terminals.close(id));
  register('terminalReleaseAdmin',()=>terminals.releaseAdmin());
  register('terminalAdminStatus',()=>terminals.adminStatus());
  register('terminalEnableAdmin',()=>withAdminPrompt(()=>terminals.enableAdmin()));
  register('terminalDisableAdmin',()=>withAdminPrompt(()=>terminals.disableAdmin()));
  register('setPinnedPanel',side=>{if(side!==null && !['left','right','bottom'].includes(side))throw new Error('Invalid panel position');pinnedPanelSide=side;});
  register('windowAction', action => {
    if (action === 'close') app.quit();
    else if (action === 'minimize') hideDock();
    else if (action === 'pin') { const pinned = !store.value.alwaysOnTop; topmost.setEnabled(pinned); store.update({ alwaysOnTop: pinned }); return pinned; }
    else if (['collapse','expand','idle','reveal','quick','picker'].includes(action)) resize(action);
    else throw new Error('Unknown window action');
    return { expanded,mode:layoutMode,bounds:win.getBounds() };
  });
  const transition=new WindowTransition(win,bounds=>screen.getDisplayNearestPoint(petCenter(bounds,store.value.petScale || 1)).workArea,()=>store.value.petScale || 1,()=>pinnedPanelSide);
  register('windowTransition',(phase,mode,reducedMotion)=>{
    if(phase==='begin')return transition.begin(mode,Boolean(reducedMotion));
    if(phase==='finish')return transition.finish();
    throw new Error('Unknown window transition phase');
  });
  await win.loadFile(indexPath);
  resize();
  win.show();
});
let quitReady=false,quitPending=false;
app.on('before-quit', event => {
  if(quitReady)return;
  event.preventDefault();
  if(shutdown && !shutdown.ready){shutdown.request().then(ok=>{if(ok)app.quit();});return;}
  if(quitPending)return;quitPending=true;
  if(win && !win.isDestroyed())win.hide();
  tray?.dispose();shortcuts?.dispose();const statsDisposal=activityStats?.dispose();clearInterval(pointerTimer);chatgpt?.close();claudeWeb?.close();bridge?.close();claude?.dispose();terminals?.dispose();
  let timeout;
  Promise.race([Promise.all([fileSearch.dispose(),statsDisposal]),new Promise(resolve=>{timeout=setTimeout(resolve,5000);})]).catch(()=>{}).finally(()=>{clearTimeout(timeout);quitReady=true;app.quit();});
});
app.on('window-all-closed', () => app.quit());
