'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`selection-app-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({note:'Existing notes',autoStart:false,autoExpand:false,compactChatTarget:'codex',shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:''}));const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady&&!DockLayoutTransition.busy);
  await app.evaluate(({Menu,ipcMain,session})=>{
   global.selectionTemplate=null;Menu.buildFromTemplate=template=>{global.selectionTemplate=template;return{popup(){}};};global.transferWrites=[];global.transferCreates=[];global.transferSends=0;
   ipcMain.removeHandler('dock:terminalCreate');ipcMain.handle('dock:terminalCreate',(_e,options)=>{global.transferCreates.push(options);return {...options,id:'selection-shell-'+global.transferCreates.length,cwd:'C:\\',shell:options.shell};});
   ipcMain.removeHandler('dock:terminalWrite');ipcMain.handle('dock:terminalWrite',(_e,...args)=>global.transferWrites.push(args));
   ipcMain.removeHandler('dock:sendTurn');ipcMain.handle('dock:sendTurn',()=>{global.transferSends++;return{};});
   ipcMain.removeHandler('dock:readThread');ipcMain.handle('dock:readThread',(_e,id)=>({thread:{id,turns:[]},runtime:{running:false}}));
   session.fromPartition('persist:petdock-chatgpt').protocol.handle('https',()=>new Response('<!doctype html><html><body><p id="source">Native selected text</p><form><textarea id="prompt-textarea">Existing GPT draft</textarea><button type="submit">Send</button></form><script>window.submits=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();submits++};</script></body></html>',{headers:{'content-type':'text/html'}}));
  });
  const choose=async label=>{await app.evaluate((_e,label)=>{const item=global.selectionTemplate[2].submenu.find(item=>item.label===label);if(!item)throw new Error('Missing destination '+label);item.click();},label);};
  const selectField=async(selector,start=0,end)=>{await app.evaluate(()=>{global.selectionTemplate=null;});await page.locator(selector).evaluate((field,{start,end})=>{field.focus();field.setSelectionRange(start,end??field.value.length);field.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));},{start,end});for(let n=0;n<100;n++){if(await app.evaluate(()=>Boolean(global.selectionTemplate)))return;await page.waitForTimeout(20);}throw new Error('Selection menu did not open');};
  await page.evaluate(()=>switchPanel('notes'));await selectField('#note',9);assert.equal(await app.evaluate(()=>global.selectionTemplate[2].submenu.length),8);
  await choose('Editor — new file');await page.waitForFunction(()=>state.activePanel==='editor'&&document.querySelector('.cm-content')?.textContent==='notes');
  await page.locator('.cm-content').focus();await page.keyboard.press('Control+a');await page.locator('.cm-content').dispatchEvent('contextmenu');await choose('Codex');
  await page.waitForFunction(()=>state.activePanel==='chats'&&document.querySelector('#prompt').value==='notes');assert.equal(await page.locator('#send').isEnabled(),false);
  await page.evaluate(()=>selectThread({id:'selection-target',name:'Selection target'}));assert.equal(await page.locator('#prompt').inputValue(),'notes','Unassigned Codex paste follows selected task');
  await selectField('#prompt');await choose('Notes');await page.waitForFunction(()=>document.querySelector('#note').value==='Existing notes\nnotes');
  await selectField('#note',15);await choose('Command Prompt (Admin)');await page.waitForFunction(()=>state.activePanel==='terminal'&&!document.querySelector('.terminal-draft').hidden);assert.equal(await page.getByRole('textbox',{name:'Command draft'}).inputValue(),'notes');assert.equal(await app.evaluate(()=>global.transferCreates[0].admin),true);assert.equal(await app.evaluate(()=>global.transferWrites.length),0);
  await page.evaluate(()=>switchPanel('notes'));await selectField('#note',15);await choose('ChatGPT');
  let id;for(let n=0;n<100;n++){id=await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL()==='https://chatgpt.com/')?.id);if(id)break;await page.waitForTimeout(50);}assert.ok(id);
  for(let n=0;n<100;n++){const text=await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript('document.querySelector("textarea")?.value'),id);if(text==='Existing GPT draft\nnotes')break;if(n===99)throw new Error('Draft paste missing');await page.waitForTimeout(50);}
  await app.evaluate(({webContents},id)=>webContents.fromId(id).emit('context-menu',{preventDefault(){}},{selectionText:'Native selected text',inputFieldType:'none'}),id);await choose('Notes');await page.waitForFunction(()=>document.querySelector('#note').value.endsWith('Native selected text'));
  await app.evaluate(({webContents},id)=>{const wc=webContents.fromId(id);global.originalDraftExecute=wc.executeJavaScript.bind(wc);wc.executeJavaScript=(script,...args)=>script.includes('async function appendInPage')?new Promise(resolve=>global.releaseDraft=resolve):global.originalDraftExecute(script,...args);},id);
  await page.evaluate(()=>{window.pendingDraftTest=dock.chatgptPaste('serialization fixture');});
  for(let n=0;n<100;n++){if(await app.evaluate(()=>Boolean(global.releaseDraft)))break;await page.waitForTimeout(20);}
  const busyError=await page.evaluate(()=>dock.chatgptSend({text:'must not send'}).then(()=>'',error=>error.message));assert.match(busyError,/already in progress/,'Send and draft paste share one lock');
  await app.evaluate(({webContents},id)=>{webContents.fromId(id).executeJavaScript=global.originalDraftExecute;global.releaseDraft({pasted:true});},id);await page.evaluate(()=>pendingDraftTest);
  assert.equal(await app.evaluate(({webContents},id)=>webContents.fromId(id).executeJavaScript('window.submits'),id),0);assert.equal(await app.evaluate(()=>global.transferSends),0);assert.equal(await app.evaluate(()=>global.transferWrites.length),0);
  console.log('PASS selection menu: eight destinations, editor/new file, unassigned Codex draft, notes append, admin shell staging, ChatGPT append and native selection; zero sends/executions.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
