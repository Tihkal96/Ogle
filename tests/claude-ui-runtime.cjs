'use strict';
// Real renderer + official CLI, isolated profile. Stop at login selection.
const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'ogle-claude-ui-'));let app;
 try{
  await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({main:'main.cjs'}));
  await fs.writeFile(path.join(dir,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{call:(method,...args)=>ipcRenderer.invoke('fixture',method,...args),events:callback=>ipcRenderer.on('event',(_e,data)=>callback(data))});`);
  await fs.writeFile(path.join(dir,'main.cjs'),`const {app,BrowserWindow,ipcMain}=require('electron');const {ClaudeBridge}=require(${JSON.stringify(path.join(root,'src/main/claude-bridge.cjs'))});let bridge;app.whenReady().then(()=>{const w=new BrowserWindow({width:900,height:700,webPreferences:{preload:${JSON.stringify(path.join(dir,'preload.cjs'))}}});bridge=new ClaudeBridge({dataDir:${JSON.stringify(dir)},env:{...process.env,CLAUDE_CONFIG_DIR:${JSON.stringify(path.join(dir,'config'))}},onEvent:event=>w.webContents.send('event',event)});ipcMain.handle('fixture',(_e,method,...args)=>{if(method==='folder')return ${JSON.stringify(dir)};return bridge[method](...args);});w.loadFile(${JSON.stringify(path.join(dir,'index.html'))});});app.on('before-quit',()=>bridge?.dispose());`);
  const file=relative=>'file:///'+path.join(root,relative).replace(/\\/g,'/');
  await fs.writeFile(path.join(dir,'index.html'),`<link rel="stylesheet" href="${file('src/renderer/claude.css')}"><style>body{margin:0;background:#111315;color:white;font:12px Arial;--border:#444;--muted:#aaa;--text:white}#claude-panel{height:650px}button,input,select{color:inherit;background:#222;padding:5px}.xterm{height:100%}[hidden]{display:none!important}</style><input id="other-panel-input" aria-label="Other panel input"><section id="claude-panel"></section><script src="${file('src/renderer/vendor/bundle.js')}"></script><script src="${file('src/renderer/claude-panel.js')}"></script><script>window.errors=[];OgleClaude.mount({state:{mode:'expand',activePanel:'claude',dockVisible:true,settings:{theme:'dark'}},api:{claudeStatus:()=>fixture.call('status'),claudeListThreads:()=>fixture.call('listThreads'),claudeCreate:options=>fixture.call('create',options),claudeWrite:(...args)=>fixture.call('write',...args),claudeResize:(...args)=>fixture.call('resize',...args),claudeClose:id=>fixture.call('close',id),chooseFolder:()=>fixture.call('folder')},report:e=>errors.push(String(e)),onActivity:()=>{},onFailure:()=>{}});fixture.events(OgleClaude.event);OgleClaude.open();</script>`);
  require('node:child_process').execFileSync(process.execPath,['--check',path.join(dir,'main.cjs')]);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:[dir],env});const page=await app.firstWindow();page.setDefaultTimeout(30000);
  await page.locator('#claude-empty-open').waitFor();assert.equal(await page.locator('#claude-enter').isDisabled(),true);
  await page.locator('#claude-empty-open').click();await page.waitForFunction(()=>document.querySelector('#claude-views').innerText.includes('Choose the text style'));
  assert.equal(await page.locator('#claude-empty').isVisible(),false);assert.equal(await page.locator('#claude-folder').innerText(),dir);
  await page.locator('#other-panel-input').focus();await page.evaluate(()=>OgleClaude.open());await page.waitForFunction(()=>document.activeElement?.classList.contains('xterm-helper-textarea'));await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#claude-views').innerText.includes('Select login method'));
  assert.deepEqual(await page.evaluate(()=>errors),[]);
  console.log('PASS real Claude renderer: explicit project choice, xterm keyboard advances official theme to login, isolated account; stopped before login.');
 }finally{if(app)await app.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
