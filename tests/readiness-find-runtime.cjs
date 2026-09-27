'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts',`readiness-find-${Date.now()}`);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}}).loadFile(${JSON.stringify(path.join(dir,'fixture.html'))}));`);
 const source='file:///'+(process.env.READINESS_FIND_SOURCE || path.join(root,'src/renderer/chat-find.js')).replaceAll('\\','/');
 fs.writeFileSync(path.join(dir,'fixture.html'),`<div id="chats-panel"><div class="conversation-header"></div><div id="messages"><div class="message-text">a.b A.B a.b</div></div><textarea id="composer"></textarea></div><div id="chatgpt-panel"><div class="subtoolbar"></div></div><script src="${source}"></script><script>window.errors=[];window.OgleDiagnostics={record:e=>errors.push(String(e))};OgleChatFind.mount({api:{},layout:()=>{},getTarget:()=> 'chats'});</script>`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const app=await electron.launch({args:[path.join(dir,'main.cjs')],env});
 try{
 const page=await app.firstWindow();page.setDefaultTimeout(5000);await page.locator('#composer').focus();await page.keyboard.press('Control+f');const field=page.locator('#chats-panel input[type=search]');await field.fill('a.b');await page.waitForFunction(()=>document.querySelector('output').textContent==='1 / 3');await field.press('Shift+Enter');assert.equal(await page.locator('output').first().textContent(),'3 / 3');await field.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'composer');
 await page.keyboard.press('Control+f');await field.fill('needle');await page.waitForFunction(()=>document.querySelector('output').textContent==='0 / 0');
 await page.evaluate(()=>{window.stream=setInterval(()=>document.querySelector('.message-text').append(document.createTextNode(' needle')),25);});await page.waitForFunction(()=>/1 \/ [1-9]/.test(document.querySelector('output').textContent),null,{timeout:1500,polling:50});await page.evaluate(()=>clearInterval(stream));
 await page.evaluate(()=>{document.querySelector('.message-text').textContent='x '.repeat(100000);window.yielded=false;});await field.fill('x');await page.evaluate(()=>setTimeout(()=>window.yielded=true,0));await page.waitForFunction(()=>document.querySelector('output').textContent==='1 / 100000');assert.equal(await page.evaluate(()=>yielded),true);assert.ok(await page.evaluate(()=>CSS.highlights.get('chat-find').size<=1500));
 await field.press('Shift+Enter');assert.equal(await page.locator('output').first().textContent(),'100000 / 100000');
 await field.fill('missing');await field.press('Enter');await page.waitForFunction(()=>document.querySelector('output').textContent==='0 / 0');assert.equal(await page.evaluate(()=>CSS.highlights.get('chat-find-current').size),0);
 await field.fill('x');await field.press('Escape');await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>CSS.highlights.has('chat-find')),false);assert.deepEqual(await page.evaluate(()=>errors),[]);
 console.log('PASS literal find, focus restoration, streaming refresh, 100000 matches with bounded painting, stale-query cancellation');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
