'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`responsive-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
 await page.waitForFunction(()=>typeof messageView!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);


 await app.evaluate(({ipcMain})=>{global.petLaunches=0;ipcMain.removeHandler('dock:openCodex');ipcMain.handle('dock:openCodex',()=>{global.petLaunches++;});});
 async function choose(action){await page.evaluate(()=>switchPanel('settings'));await page.locator('[data-setting="petClickAction"]').selectOption(action);await page.waitForFunction(action=>state.settings.petClickAction===action,action);await page.evaluate(()=>setMode('reveal'));}
 await choose('codex');await page.locator('#pet').click();await page.waitForTimeout(100);assert.equal(await app.evaluate(()=>global.petLaunches),1,'One physical click launches once');
 await choose('expand');await page.locator('#pet').click();await page.waitForFunction(()=>state.mode==='expand'&&!DockLayoutTransition.busy);
 await choose('reveal');await page.evaluate(()=>setMode('expand'));await page.locator('#pet').click();await page.waitForFunction(()=>state.mode==='reveal'&&!DockLayoutTransition.busy);
 await choose('toggle');await page.locator('#pet').click();await page.waitForFunction(()=>state.mode==='expand'&&!DockLayoutTransition.busy);await page.locator('#pet').click();await page.waitForFunction(()=>state.mode==='reveal'&&!DockLayoutTransition.busy);
 await choose('animation');await page.locator('#pet').click();await page.waitForFunction(()=>!!state.clickAnimation);assert.equal(await app.evaluate(()=>global.petLaunches),1);
 await choose('none');await page.locator('#pet').click();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>state.mode),'reveal');assert.equal(await app.evaluate(()=>global.petLaunches),1);
 await page.evaluate(()=>saveQueue);assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'settings.json'))).petClickAction,'none');
 console.log('Configurable pet pointer-click actions, single dispatch and persistence passed');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
