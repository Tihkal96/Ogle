'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`admin-hold-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'chatgpt',autoStart:false,autoExpand:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:''}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();await app.evaluate(({app,BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.hide();w.webContents.setBackgroundThrottling(false);screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});const load=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');const {TerminalManager}=load('./src/main/terminal-manager.cjs');global.adminResolvers=[];TerminalManager.prototype.create=()=>new Promise((resolve,reject)=>global.adminResolvers.push({resolve,reject}));});
  await page.waitForFunction(()=>typeof state!=='undefined'&&!DockLayoutTransition.busy&&state.settings.autoExpand===false);
  // Hide after boot has completed its final show, so real pointer activity cannot affect the timing fixture.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
  for(const mode of ['expand','quick']){
   await page.evaluate(async mode=>{state.settings.autoExpand=true;state.settings.autoCollapseDelay=1000;state.panelPinned=false;state.pointerInside=false;state.nativePointerInside=false;await setMode(mode);window.adminResults=[];window.pendingAdminOne=api.terminalCreate({shell:'powershell',admin:true}).then(()=>adminResults.push('ok'),()=>adminResults.push('cancelled'));window.pendingAdminTwo=api.terminalCreate({shell:'cmd',admin:true}).then(()=>adminResults.push('ok'),()=>adminResults.push('cancelled'));},mode);
   await page.waitForFunction(()=>state.adminPromptPending===true);await page.waitForTimeout(1300);assert.equal(await page.evaluate(()=>state.mode),mode);
   await app.evaluate(()=>global.adminResolvers.shift().resolve({id:'fixture'}));await page.waitForFunction(()=>adminResults.length===1);assert.equal(await page.evaluate(()=>state.adminPromptPending),true,'overlapping approval remains held');
   await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>state.mode),mode);
   await app.evaluate(()=>global.adminResolvers.shift().reject(new Error('Fixture cancellation')));await page.waitForFunction(()=>state.adminPromptPending===false);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>state.mode),mode,'full new delay after resolution/cancellation');
   await page.waitForFunction(mode=>state.mode!==mode,mode).catch(async error=>{console.log(await page.evaluate(()=>({mode:state.mode,pointer:state.pointerInside,native:state.nativePointerInside,pending:state.adminPromptPending,busy:DockLayoutTransition.busy,auto:state.settings.autoExpand,pinned:state.panelPinned,dialog:!!document.querySelector('dialog[open]'),approval:!!document.querySelector('.approval')})));throw error;});await page.waitForFunction(()=>!DockLayoutTransition.busy);
  }
  console.log('Real admin IPC holds auto-collapse through overlapping pending approval, success and cancellation; no elevation performed.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
