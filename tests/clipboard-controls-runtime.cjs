'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`clipboard-controls-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,compactChatTarget:'codex'}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});await page.waitForFunction(()=>typeof messageView!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
 await app.evaluate(({ipcMain})=>{global.testClipboard='';global.testWrites=[];for(const [name,fn]of Object.entries({clipboardReadText:()=>global.testClipboard,clipboardWriteText:(_event,text)=>{global.testClipboard=text;},terminalCreate:()=>({id:'test-terminal',shell:'cmd',cwd:'C:\\'}),terminalWrite:(_event,id,text)=>{global.testWrites.push(text);},terminalResize:()=>{},terminalClose:()=>{}})){ipcMain.removeHandler('dock:'+name);ipcMain.handle('dock:'+name,fn);}});
 await page.evaluate(()=>switchPanel('editor'));await page.waitForFunction(()=>!DockLayoutTransition.busy);
 const content=page.locator('#editor-panel .cm-content');await content.click();await page.keyboard.insertText('clipboard sample');await page.keyboard.press('Control+a');
 await page.getByRole('button',{name:'Copy selection',exact:true}).click();assert.equal(await app.evaluate(()=>global.testClipboard),'clipboard sample');
 await app.evaluate(()=>{global.testClipboard='plain replacement';});await page.getByRole('button',{name:'Paste',exact:true}).click();assert.equal(await content.innerText(),'plain replacement');
 await page.evaluate(()=>{const Original=PetDockVendors.Terminal;PetDockVendors.Terminal=class extends Original{constructor(...args){super(...args);window.clipboardTestTerm=this;}};switchPanel('terminal');});await page.waitForFunction(()=>!DockLayoutTransition.busy);
 await page.getByRole('button',{name:'New Command Prompt',exact:true}).click();await page.waitForFunction(()=>!!window.clipboardTestTerm);
 await page.evaluate(()=>new Promise(resolve=>clipboardTestTerm.write('terminal selection',resolve)));await page.evaluate(()=>clipboardTestTerm.select(0,0,18));
 await page.getByRole('button',{name:'Copy selection (Ctrl+C)',exact:true}).click();assert.equal(await app.evaluate(()=>global.testClipboard),'terminal selection');assert.deepEqual(await app.evaluate(()=>global.testWrites),[]);
 await app.evaluate(()=>{global.testClipboard='echo pasted';});await page.getByRole('button',{name:'Paste (Ctrl+V)',exact:true}).click();await page.waitForTimeout(50);assert.deepEqual(await app.evaluate(()=>global.testWrites),['echo pasted']);
 await page.getByRole('button',{name:'Interrupt (Ctrl+C)',exact:true}).click();assert.deepEqual(await app.evaluate(()=>global.testWrites),['echo pasted','\x03']);
 await page.evaluate(()=>clipboardTestTerm.select(0,0,18));await page.locator('#terminal-panel .xterm-helper-textarea').press('Control+c');await page.waitForTimeout(50);assert.deepEqual(await app.evaluate(()=>global.testWrites),['echo pasted','\x03']);
 console.log('Editor and terminal copy/paste, selection preservation and separate interrupt passed; real clipboard untouched.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
