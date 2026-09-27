'use strict';
const { app, BrowserWindow, ipcMain, dialog, screen, Notification, shell, Menu, net, nativeImage, globalShortcut, clipboard } = require('electron');
if (process.argv.includes('--persistent-terminal-worker')) { require('./persistent-admin-worker.cjs').runPersistentWorker(); return; }
if (process.argv.includes('--terminal-worker')) { require('./terminal-worker.cjs').runWorker(); return; }
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DockShortcuts } = require('./global-shortcuts.cjs');
const { createActivityStats } = require('./activity-stats.cjs');
const { SettingsStore } = require('./settings.cjs');
const { CodexBridge } = require('./codex-bridge.cjs');
const { ChatGPTPanel } = require('./chatgpt-panel.cjs');
const { sendChatGPT } = require('./chatgpt-composer.cjs');
const { DockFiles } = require('./files.cjs');
const windowsTools=require('./windows-tools.cjs').createWindowsTools();
const fileSearch=require('./file-search.cjs').createFileSearch({includeFixedDrives:true,dataDir:()=>app.getPath('userData'),roots:()=>['desktop','documents','downloads','pictures','music','videos'].map(name=>app.getPath(name))});
const { TerminalManager } = require('./terminal-manager.cjs');
const { PetLibrary } = require('./pet-library.cjs');
const { dockBounds, petCenter, clampPet } = require('./window-layout.cjs');
const { WindowTransition } = require('./window-transition.cjs');
const {configureStartup,ensureCodex}=require('./startup.cjs');
const {idleIcon}=require('./pet-icon.cjs');

app.setName('Ogle');
// Preserve existing profiles, browser sign-ins and the single Windows startup entry.
app.setAppUserModelId('PetDock.Desktop');
app.setPath('userData', process.env.PETDOCK_DATA_DIR ? path.resolve(process.env.PETDOCK_DATA_DIR) : path.join(app.getPath('appData'), 'PetDock'));
if (!app.requestSingleInstanceLock()) {app.quit();return;}
let activityStats, shortcuts, win, bridge, chatgpt, store, files, terminals, petLibrary, petDragState, pointerTimer, connection = { state: 'connecting', detail: 'Connecting to Codex…' }, connectionPromise;
const root = path.resolve(__dirname, '../..');
const indexPath = path.join(root, 'src/renderer/index.html');
const indexUrl = pathToFileURL(indexPath).href;
let expanded = false;
let pinnedPanelSide = null;
let layoutMode = 'idle';
app.on('second-instance', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
function send(payload) { if (win && !win.isDestroyed()) win.webContents.send('dock:event', payload); }
let pendingAdminOperations=0;
async function withAdminPrompt(action){
  pendingAdminOperations++;send({type:'admin-prompt',pending:true});
  try{return await action();}
  finally{pendingAdminOperations--;send({type:'admin-prompt',pending:pendingAdminOperations>0});}
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
async function updatePetIcon(){const library=await pets();const pet=library.find(p=>p.id===store.value.petId)||library[0];const icon=idleIcon(nativeImage,pet);if(icon&&!win.isDestroyed())win.setIcon(icon);}
function resize(mode = layoutMode) {
  if(typeof mode==='boolean')mode=mode?'expand':'idle';
  if(mode==='collapse')mode='idle';
  layoutMode=mode;
  expanded = mode==='expand';
  const bounds = win.getBounds();
  const area = screen.getDisplayNearestPoint(petCenter(bounds,store?.value.petScale || 1)).workArea;
  const scale = store?.value.petScale || 1;
  if (!expanded) chatgpt?.hide();
  const next=dockBounds(mode,bounds,area,scale,pinnedPanelSide);
  if(['x','y','width','height'].some(key=>next[key]!==bounds[key]))win.setBounds(next);
}
async function connected() { await connectionPromise; if (connection.state === 'error') throw new Error(connection.detail); }
app.whenReady().then(async () => {
  store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
  configureStartup(app,store.value.autoStart);
  if(process.argv.includes('--autostart')&&!process.env.PETDOCK_DATA_DIR)ensureCodex({open:url=>shell.openExternal(url)}).catch(error=>send({type:'startup-error',message:error.message}));
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({ title: 'Ogle', width: Math.min(600, area.width), height: Math.min(200, area.height), x: area.x + Math.max(0, area.width - 620), y: area.y + Math.max(0, area.height - 220), transparent: true, frame: false, resizable: false, backgroundColor: '#00000000', alwaysOnTop: store.value.alwaysOnTop, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  // Native stage dragging follows the same pet-only boundary as pet dragging.
  win.on('will-move',(event,bounds)=>{
    const scale=store.value.petScale || 1,area=screen.getDisplayNearestPoint(petCenter(bounds,scale)).workArea;
    const next=clampPet(bounds,area,scale);
    if(next.x!==bounds.x || next.y!==bounds.y){event.preventDefault();win.setPosition(next.x,next.y);}
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (url !== indexUrl) event.preventDefault(); });
  chatgpt = new ChatGPTPanel({ parent: win, getBounds: () => win.getBounds(), onStatus: status => send({ type: 'chatgpt', ...status }),onActivity: activity=>send({type:'chatgpt-activity',...activity}),onInteraction:()=>send({type:'chatgpt-interaction'}) });
  shortcuts=new DockShortcuts(globalShortcut,{
    shortcutVisibility:()=>{if(win.isVisible()&&!win.isMinimized()){chatgpt.hide();win.hide();}else{if(win.isMinimized())win.restore();win.show();win.focus();send({type:'dock-shown'});}},
    shortcutChatTarget:()=>{if(win.isMinimized())win.restore();win.show();win.focus();send({type:'toggle-chat-target'});},
    shortcutBar:()=>{if(win.isMinimized())win.restore();win.show();win.focus();send({type:'toggle-bar'});},
    shortcutPanel:()=>{if(win.isMinimized())win.restore();win.show();win.focus();send({type:'toggle-panel',expanded:!expanded});}
  });
  try{shortcuts.configure(store.value);}catch(error){send({type:'startup-error',message:error.message});}
  activityStats=createActivityStats({onUpdate:data=>send({type:'activity-stats',...data}),onError:error=>send({type:'startup-error',message:error.message})});
  activityStats.configure(store.value);
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
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    const x=p.x-b.x,y=p.y-b.y;
    if (inside !== lastInside || x!==lastPointerX || y!==lastPointerY) { lastInside=inside;lastPointerX=x;lastPointerY=y;send({type:'pointer',inside,x,y}); }
  }, 160);
  bridge = new CodexBridge();
  const desktopActivity = new Map();
  bridge.on('status', status => { connection = status; send({ type: 'connection', ...status }); });
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
  connectionPromise = bridge.connect().catch(error => { connection = { state: 'error', detail: error.message }; send({ type: 'connection', ...connection }); });
  register('boot', async () => {
    await connectionPromise;
    let threads = { data: [], nextCursor: null };
    try { threads = await bridge.listThreads(); } catch (error) { connection = { ...connection, detail: error.message }; }
    return { threads, pets: await pets(), settings: store.value, connection };
  });
  register('listThreads', async (filters = {}) => { await connected(); return bridge.listThreads(filters); });
  register('readThread', async id => { await connected(); return bridge.readThread(string(id, 'task ID')); });
  register('startThread', async cwd => {
    await connected(); string(cwd, 'project folder');
    if (!path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Choose an existing project folder');
    return bridge.startThread(cwd);
  });
  register('sendTurn', async (id, text, images=[]) => { await connected(); if(typeof text!=='string'||text.length>200000)throw new Error('Invalid prompt');return bridge.sendTurn(string(id, 'task ID'),text,images); });
  register('steerTurn', async(id,text,images=[],expectedTurnId)=>{await connected();if(typeof text!=='string'||text.length>200000)throw new Error('Invalid prompt');return bridge.steerTurn(string(id,'task ID'),text,images,expectedTurnId);});
  register('interrupt', (id, turnId) => bridge.interrupt(string(id, 'task ID'), string(turnId, 'turn ID')));
  register('respond', (id, result) => bridge.respond(id, result));
  register('saveSettings', async patch => { const previous=store.value,changedShortcuts=['shortcutVisibility','shortcutPanel','shortcutBar','shortcutChatTarget'].some(key=>Object.hasOwn(patch,key));if(changedShortcuts)shortcuts.configure({...previous,...patch});let result;try{result=store.update(patch);}catch(error){if(changedShortcuts)shortcuts.configure(previous);throw error;}activityStats.configure(result);if(Object.hasOwn(patch,'petScale'))resize();if(Object.hasOwn(patch,'alwaysOnTop'))win.setAlwaysOnTop(result.alwaysOnTop);if(Object.hasOwn(patch,'autoStart'))configureStartup(app,result.autoStart);if(Object.hasOwn(patch,'petId'))await updatePetIcon();return result; });
  register('chooseFolder', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Choose a Codex project folder' });
    return result.canceled ? null : result.filePaths[0];
  });
  register('openChatGPT', action => chatgpt.show(action));
  register('chatgptSend', async payload => {
    await chatgpt.show();
    const contents=chatgpt.view.webContents,deadline=Date.now()+10000;
    while(!contents.isDestroyed() && contents.isLoadingMainFrame() && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    return sendChatGPT(contents,payload);
  });
  register('chatgptLayout', layout => chatgpt.layout(layout));
  register('openCodex', id => shell.openExternal(id ? `codex://threads/${encodeURIComponent(string(id, 'task ID'))}` : 'codex://'));
  register('petDrag', action => {
    if(action==='start'){petDragState={pointer:screen.getCursorScreenPoint(),bounds:win.getBounds(),moved:false};return {moved:false};}
    if(!petDragState)return {moved:false};
    const p=screen.getCursorScreenPoint(),dx=p.x-petDragState.pointer.x,dy=p.y-petDragState.pointer.y;
    if(action==='move' && (Math.abs(dx)>3||Math.abs(dy)>3)) {
      petDragState.moved=true;const b=petDragState.bounds;
      const area=screen.getDisplayNearestPoint(p).workArea;
      const next=clampPet({...b,x:b.x+dx,y:b.y+dy},area,store.value.petScale || 1);
      win.setPosition(next.x,next.y);
    }
    const moved=petDragState.moved;if(action==='end')petDragState=null;return {moved};
  });
  register('petMenu',()=>{Menu.buildFromTemplate([
    {label:'Open Codex',click:()=>shell.openExternal('codex://')},
    {label:expanded?'Collapse dock':'Expand dock',click:()=>send({type:'toggle-panel',expanded:!expanded})},
    {label:'Show metrics',type:'checkbox',checked:store.value.statsVisible!==false,click:item=>{store.update({statsVisible:item.checked});activityStats.configure(store.value);send({type:'settings',settings:store.value});}},
    {label:'Settings',click:()=>send({type:'settings-open'})},
    {label:'Always on top',type:'checkbox',checked:win.isAlwaysOnTop(),click:item=>{win.setAlwaysOnTop(item.checked);store.update({alwaysOnTop:item.checked});send({type:'settings',settings:store.value});}},
    {type:'separator'},
    {label:'Minimize',click:()=>win.minimize()},
    {label:'Quit Ogle',click:()=>send({type:'request-close'})}
  ]).popup({window:win});return true;});
  register('listPets',()=>pets());
  register('refreshPets',async()=>{const result=await petLibrary.refresh();await updatePetIcon();return result;});
  register('petIcon',data=>{
    if(typeof data!=='string'||data.length>180000||!data.startsWith('data:image/png;base64,'))throw new Error('Invalid pet icon');
    const icon=nativeImage.createFromDataURL(data),size=icon.getSize();
    if(icon.isEmpty()||size.width>256||size.height>256)throw new Error('Invalid pet icon dimensions');
    win.setIcon(icon);return true;
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
    else if (action === 'minimize') win.minimize();
    else if (action === 'pin') { const pinned = !win.isAlwaysOnTop(); win.setAlwaysOnTop(pinned); store.update({ alwaysOnTop: pinned }); return pinned; }
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
let quitReady=false;
app.on('before-quit', event => {
  if(quitReady)return;
  event.preventDefault();shortcuts?.dispose();activityStats?.dispose();clearInterval(pointerTimer);chatgpt?.close();bridge?.close();terminals?.dispose();
  let timeout;
  Promise.race([fileSearch.dispose(),new Promise(resolve=>{timeout=setTimeout(resolve,5000);})]).catch(()=>{}).finally(()=>{clearTimeout(timeout);quitReady=true;app.quit();});
});
app.on('window-all-closed', () => app.quit());
