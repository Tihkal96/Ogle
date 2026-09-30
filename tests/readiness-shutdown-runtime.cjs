'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`shutdown-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,compactChatTarget:'codex'}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});let closed=false;
 try {
 const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.settings.autoStart===false&&state.bootReady);
 await page.evaluate(()=>switchPanel('editor'));await page.waitForSelector('#editor-panel .cm-content');
 await page.evaluate(()=>{window.originalFlush=flushLocal;flushLocal=async()=>{throw new Error('Simulated save failure');};});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
 await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.querySelector('#note')!==null),true);
 await page.evaluate(()=>{flushLocal=window.originalFlush;});
 await page.locator('#editor-panel .cm-content').fill('editor text before native close');
 await page.evaluate(()=>{const note=document.querySelector('#note');note.value='last edit before native close';note.dispatchEvent(new Event('input',{bubbles:true}));});
 const closing=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),0);});await closing;closed=true;
 const saved=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));
 assert.equal(saved.note,'last edit before native close');assert.ok(saved.editorTabs.some(tab=>tab.text==='editor text before native close'));
 console.log('Native close preserves app on failed flush; retry flushes immediate note and editor edits.');
 }finally{if(!closed){for(const page of app.windows())await page.evaluate(()=>{if(window.originalFlush)flushLocal=window.originalFlush;}).catch(()=>{});await app.close().catch(()=>{});}}
})().catch(error=>{console.error(error);process.exitCode=1;});
