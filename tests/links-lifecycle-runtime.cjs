'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`links-lifecycle-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:true,shortcuts:[{id:'one',name:'Original',kind:'url',path:'https://example.com'}]}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});await page.waitForSelector('[data-id="one"]',{state:'attached'});await page.waitForFunction(()=>!DockLayoutTransition.busy);
 const edit=async()=>{await page.evaluate(()=>switchPanel('shortcuts'));await page.locator('[data-id="one"] button[title="Rename or edit target"]').evaluate(n=>n.click());await page.getByLabel('Display name',{exact:true}).fill('Unfinished');};
 const discarded=async()=>{assert.equal(await page.locator('.links-form').isHidden(),true);assert.equal(await page.evaluate(()=>state.settings.shortcuts[0].alias),'');};
 await edit();await page.evaluate(()=>switchPanel('notes'));await discarded();
 await edit();await page.evaluate(()=>collapse(true));await discarded();
 await edit();await page.locator('#always-top').dispatchEvent('pointerdown');await page.locator('#always-top').evaluate(n=>n.click());await discarded();
 await edit();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await discarded();
 console.log(JSON.stringify({panelChangeDiscards:true,collapseDiscards:true,toolbarControlDiscards:true,leavingWindowDiscards:true,originalPreserved:true}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
