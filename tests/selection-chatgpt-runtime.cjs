'use strict';
const assert=require('node:assert/strict');
if(process.versions.electron){
 const {app,BrowserWindow,session}=require('electron');global.pasteDraft=require('../src/main/chatgpt-draft.cjs').pasteChatGPTDraft;
 app.whenReady().then(async()=>{const isolated=session.fromPartition('draft-fixture-'+Date.now());await isolated.protocol.handle('https',request=>new Response(`<form>${new URL(request.url).pathname.includes('textarea')?'<textarea id="prompt-textarea">Existing draft</textarea>':'<div id="prompt-textarea" contenteditable="true">Existing draft</div>'}<div data-testid="attachment">keep.txt</div><button type="submit">Send</button></form><script>window.submits=0;window.inputs=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();submits++};document.querySelector('#prompt-textarea').oninput=()=>inputs++;</script>`,{headers:{'content-type':'text/html'}}));const window=new BrowserWindow({show:false,webPreferences:{session:isolated}});await window.loadURL('https://chatgpt.com/contenteditable');});
}else{
 const {_electron:electron}=require('playwright');
 (async()=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const app=await electron.launch({args:[__filename],env});try{
 const page=await app.firstWindow();
 for(const mode of ['contenteditable','textarea']){
 await page.goto('https://chatgpt.com/'+mode);
 await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0].webContents;while(w.isLoadingMainFrame())await new Promise(r=>setTimeout(r,10));});
 assert.deepEqual(await app.evaluate(async({BrowserWindow})=>global.pasteDraft(BrowserWindow.getAllWindows()[0].webContents,'selected text\nsecond line')),{pasted:true});
 assert.equal(await page.locator('#prompt-textarea').evaluate(el=>el.tagName==='TEXTAREA'?el.value:el.innerText),'Existing draft\nselected text\nsecond line');
 assert.equal(await page.locator('[data-testid="attachment"]').innerText(),'keep.txt');assert.equal(await page.evaluate(()=>submits),0);assert.ok(await page.evaluate(()=>inputs)>0);
 }
 await page.goto('https://wrong.example/');const wrong=await app.evaluate(async({BrowserWindow})=>{try{await global.pasteDraft(BrowserWindow.getAllWindows()[0].webContents,'no');return '';}catch(e){return e.message;}});assert.match(wrong,/signing in/);
 const liveWrong=await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0].webContents;try{await global.pasteDraft({isDestroyed:()=>false,isLoadingMainFrame:()=>false,getURL:()=> 'https://chatgpt.com/',executeJavaScript:(...args)=>w.executeJavaScript(...args)},'no');return '';}catch(e){return e.message;}});assert.match(liveWrong,/changed pages/);
 console.log('ChatGPT draft append preserves contenteditable/textarea drafts and attachments, emits input, never submits, rejects wrong origin.');
 }finally{await app.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
}
