'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`responsive-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
 await page.waitForFunction(()=>typeof messageView!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);


 await app.evaluate(({ipcMain})=>{
  global.linkCalls=[];
  for(const name of ['runCommand','openWindowsTool','searchFiles','openShortcut']){ipcMain.removeHandler('dock:'+name);ipcMain.handle('dock:'+name,(_e,value)=>{global.linkCalls.push({name,value});if(name==='searchFiles')return value==='missing'?{status:'setup',message:'Install Everything and ES.'}:{status:'ok',results:['C:\\fixture.txt']};return {launched:true};});}
 });
 await page.evaluate(()=>switchPanel('shortcuts'));
 assert.equal(await page.locator('.links-root-drop').count(),0);
 await page.waitForFunction(()=>$('windows-tool').options.length>20);
 assert.ok((await page.locator('#windows-tool').innerText()).includes('Remote Desktop (mstsc)'));
 await page.locator('#links-run').fill('notepad.exe "C:\\a b.txt"');
 assert.equal((await app.evaluate(()=>global.linkCalls)).length,0,'Typing does not execute');
 await page.locator('#links-run').evaluate(el=>el.form.requestSubmit());
 await page.waitForFunction(()=>$('links-run').value==='');
 await page.locator('#windows-tool').selectOption('control-panel');
 await page.locator('.links-tools').getByRole('button',{name:'Open',exact:true}).evaluate(el=>el.click());
 await page.locator('#links-file-search').fill('report');
 await page.locator('#links-file-search').evaluate(el=>el.form.requestSubmit());
 await page.locator('.links-search-results button').waitFor({state:'visible'});
 await page.locator('.links-search-results button').evaluate(el=>el.click());
 const calls=await app.evaluate(()=>global.linkCalls);
 assert.deepEqual(calls.map(c=>c.name),['runCommand','openWindowsTool','searchFiles','openShortcut']);
 assert.equal(calls[0].value,'notepad.exe "C:\\a b.txt"');assert.equal(calls[1].value,'control-panel');
 await page.locator('#links-file-search').fill('missing');await page.locator('#links-file-search').evaluate(el=>el.form.requestSubmit());
 await page.locator('.links-search-results').getByText('Everything setup ↗').waitFor({state:'visible'});
 await page.locator('.links-tools').getByRole('button',{name:'Clear',exact:true}).evaluate(el=>el.click());
 assert.equal(await page.locator('.links-search-results').isHidden(),true);
 await page.evaluate(()=>{state.petHovered=false;state.reactionUntil=0;state.pendingReaction=null;state.running.set('working-fixture','turn');updatePetState();idleAnimation.tick(performance.now(),state.petState,animations);idleAnimation.since=performance.now()-60001;});
 await page.waitForFunction(()=>!!idleAnimation.active);
 assert.equal(await page.evaluate(()=>state.petState),'running');
 await page.waitForFunction(()=>!idleAnimation.active && $('pet').dataset.state==='running');
 assert.ok(await page.evaluate(()=>performance.now()-idleAnimation.since<1000));
 console.log('Run, Windows tools, on-demand search/setup, drop-box removal and working flourish passed');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
