'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','codex-cold-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,autoCollapse:false,compactChatTarget:'codex',statsClicks:false,statsKeys:false}));
 fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'ogle-cold-test',main:'main.cjs'}));
 fs.writeFileSync(path.join(profile,'main.cjs'),`
 const {EventEmitter}=require('node:events');
 const bridgeModule=require(${JSON.stringify(path.join(root,'src/main/codex-bridge.cjs'))});
 bridgeModule.CodexBridge=class extends EventEmitter{constructor(){super();global.testBridge=this;}async connect(){this.emit('status',{state:'disconnected'});return {};}async listThreads(){return {data:[]};}close(){}};
 const {ipcMain}=require('electron'),handle=ipcMain.handle.bind(ipcMain);let injected=false;
 ipcMain.handle=(channel,handler)=>handle(channel,async(event,...args)=>{
  if(channel==='dock:windowTransition'&&args[0]==='begin'&&!injected){injected=true;global.testBridge.emit('status',{state:'connected'});global.testBridge.emit('activity',{threadId:'quiet-task',turnId:'new',running:true,baseline:true});}
  return handler(event,...args);
 });
 require(${JSON.stringify(path.join(root,'src/main/main.cjs'))});`);
 execFileSync(process.execPath,['--check',path.join(profile,'main.cjs')],{windowsHide:true});
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[profile],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady&&!DockLayoutTransition.busy);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>state.connected),true,'Old boot connection must not erase a newer live connection');
  assert.equal(await page.evaluate(()=>state.mode),'idle');
  assert.equal(await page.evaluate(()=>state.petState),'running','Untouched startup detects new live work');
  assert.equal(await page.locator('#pet').getAttribute('data-state'),'running');
  await app.evaluate(()=>testBridge.emit('activity',{threadId:'quiet-task',turnId:'new',running:false,completed:true}));
  await page.waitForFunction(()=>state.petState==='review');
  await app.evaluate(()=>testBridge.emit('activity',{threadId:'quiet-task',turnId:'next',running:true}));
  await page.waitForFunction(()=>state.petState==='running'&&canvas.dataset.state==='running');
  assert.equal(await page.evaluate(()=>state.mode),'idle','No dock interaction was needed');
  console.log('Cold startup preserves newer live connection/activity over stale boot; running overrides persistent done, without click, focus or task selection.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
