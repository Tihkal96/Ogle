'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`chat-find-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoExpand:false,autoStart:false,compactChatTarget:'chatgpt',shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:''}));
const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
try{
 const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy,null,{timeout:60000});
 await app.evaluate(({session})=>session.fromPartition('persist:petdock-chatgpt').protocol.handle('https',()=>new Response('<!doctype html><html><body><main>needle Needle needle</main><textarea aria-label="Message"></textarea></body></html>',{headers:{'content-type':'text/html'}})));
 await page.evaluate(async()=>{await switchPanel('chats');addMessage('find-fixture','assistant','needle Needle needle');});await page.waitForSelector('.message-text');
 await page.keyboard.press('Control+f');let row=page.locator('#chats-panel .chat-find'),field=row.locator('input[type=search]');await field.fill('needle');await page.waitForFunction(()=>document.querySelector('#chats-panel .chat-find output').textContent==='1 / 3');
 await field.press('Enter');assert.equal(await row.locator('output').textContent(),'2 / 3');await field.press('Shift+Enter');assert.equal(await row.locator('output').textContent(),'1 / 3');
 await row.locator('input[type=checkbox]').check();await page.waitForFunction(()=>document.querySelector('#chats-panel .chat-find output').textContent==='1 / 2');
 await field.fill('absent');await page.waitForFunction(()=>document.querySelector('#chats-panel .chat-find output').textContent==='0 / 0');await field.press('Escape');assert.equal(await row.isVisible(),false);assert.equal(await page.evaluate(()=>CSS.highlights.has('chat-find')),false);
 await page.evaluate(()=>switchPanel('chatgpt'));await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setPosition(100,10);w.show();w.focus();});let id;for(let n=0;n<30;n++){id=await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL()==='https://chatgpt.com/')?.id);if(id)break;await new Promise(r=>setTimeout(r,100));}assert.ok(id);
 await app.evaluate(({webContents},id)=>{const wc=webContents.fromId(id);wc.focus();wc.sendInputEvent({type:'keyDown',keyCode:'f',modifiers:['control']});wc.sendInputEvent({type:'keyUp',keyCode:'f',modifiers:['control']});},id);
 row=page.locator('#chatgpt-panel .chat-find');field=row.locator('input[type=search]');await field.waitFor({state:'visible'});assert.equal(await field.evaluate(n=>n===document.activeElement),true);
 await field.fill('needle');await page.waitForFunction(()=>document.querySelector('#chatgpt-panel .chat-find output').textContent==='1 / 3');await field.press('Enter');await page.waitForFunction(()=>document.querySelector('#chatgpt-panel .chat-find output').textContent==='2 / 3');await field.press('Shift+Enter');await page.waitForFunction(()=>document.querySelector('#chatgpt-panel .chat-find output').textContent==='1 / 3');
 const r=await row.boundingBox(),view=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds());assert.ok(view.y>=r.y+r.height-1,'Native ChatGPT cannot cover find row');
 await row.locator('input[type=checkbox]').check();await page.waitForFunction(()=>document.querySelector('#chatgpt-panel .chat-find output').textContent==='1 / 2');
 await page.evaluate(()=>setMode('reveal'));assert.equal(await row.isVisible(),false);
 await page.evaluate(()=>switchPanel('editor'));await page.keyboard.press('Control+f');assert.equal(await page.locator('.chat-find:not([hidden])').count(),0,'Editor keeps its own Ctrl+F');
 console.log('PASS: Codex and native ChatGPT Ctrl+F, next/previous, case, no matches, Escape, collapse, editor shortcut, and native view geometry.');
}finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
