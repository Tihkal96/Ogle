'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','panel-view-'+Date.now());fs.mkdirSync(profile,{recursive:true});const settings={autoStart:false,autoExpand:false,autoCollapse:false,compactChatTarget:'codex'};for(const key of require('../src/main/global-shortcuts.cjs').shortcutKeys)settings[key]='';fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify(settings));const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady&&!DockLayoutTransition.busy);
 await app.evaluate(({session,BrowserWindow})=>{BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false);session.fromPartition('persist:petdock-chatgpt').protocol.handle('https',()=>new Response('<!doctype html><html><body><main>Local zoom fixture</main><textarea aria-label="Message"></textarea></body></html>',{headers:{'content-type':'text/html'}}));});
 await page.evaluate(async()=>{await switchPanel('chats');addMessage('alignment-fixture','user','My message');});
 assert.equal(await page.locator('.message.user .message-label').innerText(),'YOU');assert.equal(await page.locator('.message.user .message-label').evaluate(n=>getComputedStyle(n).textAlign),'right');assert.equal(await page.locator('.shell>footer').isVisible(),false);
 const panels=['chats','notes','editor','terminal','shortcuts','settings','chatgpt'];
 for(const name of panels){
  await page.evaluate(name=>switchPanel(name),name);await page.waitForFunction(()=>!DockLayoutTransition.busy);
  if(name==='terminal'){await page.evaluate(()=>PetDockTerminal.create('cmd'));await page.locator('.terminal-session .xterm-char-measure-element').first().waitFor({state:'attached'});}
  const before=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
  await page.locator('#'+name+'-panel .panel-fullscreen-button').click();await page.waitForFunction(name=>OglePanelView.active===name&&document.body.classList.contains('panel-fullscreen'),name);
  await page.waitForTimeout(600);
  assert.deepEqual(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds()),await app.evaluate(({screen},b)=>screen.getDisplayMatching(b).bounds,before),name+' fills monitor bounds');
  const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,regions:OgleWindowShape.rectangles()}));assert.deepEqual(viewport.regions,[{x:0,y:0,width:viewport.width,height:viewport.height}]);assert.equal(viewport.height,(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds())).height);
  if(['editor','chats','shortcuts'].includes(name))await page.screenshot({path:path.join(profile,'fullscreen-'+name+'.png'),mask:name==='chats'?[page.locator('#thread-list'),page.locator('#project-filter')]:[]});
  assert.equal(await page.locator('.toolbar').isVisible(),false,name+' hides toolbar');assert.equal(await page.locator('.pet-stage').isVisible(),false,name+' hides pet');
  const rect=await page.locator('#'+name+'-panel').boundingBox();assert.ok(rect.width>700&&rect.height>400,name+' fills available display');
  await page.locator('#'+name+'-panel').dispatchEvent('wheel',{ctrlKey:true,deltaY:-100,bubbles:true,cancelable:true});
  await page.waitForFunction(()=>document.querySelector('#panel-zoom-reset').textContent==='110%');
  if(name==='chatgpt')assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.getZoomFactor()),1.1);
  else if(name==='terminal')assert.ok(await page.locator('.terminal-session .xterm-char-measure-element').first().evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>12),'Actual CMD terminal text zooms');
  else if(name==='chats')assert.equal(await page.locator('#messages').evaluate(n=>Number(n.style.zoom)),1.1);
  else if(name==='editor')assert.ok(await page.locator('#editor-panel .cm-editor').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>12));
  else if(name==='notes')assert.ok(await page.locator('#note').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>13));
  else if(name==='shortcuts'||name==='settings')assert.equal(await page.locator(name==='shortcuts'?'.links-content':'.settings-section').first().evaluate(n=>Number(getComputedStyle(n).zoom)),1.1,name+' content visibly zooms in fullscreen');
  if(name==='chatgpt'){
   await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();});await page.waitForTimeout(300);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()),true);
   await app.evaluate(async({BrowserWindow})=>{const wc=BrowserWindow.getAllWindows()[0].contentView.children[0].webContents;wc.focus();wc.sendInputEvent({type:'keyDown',keyCode:'Control',modifiers:['control']});wc.sendInputEvent({type:'mouseWheel',x:120,y:100,deltaY:120,canScroll:true,modifiers:['control']});wc.sendInputEvent({type:'keyUp',keyCode:'Control'});});
   await page.waitForTimeout(200);
   await page.waitForFunction(()=>document.querySelector('#panel-zoom-reset').textContent!=='110%',null,{timeout:5000});
   assert.notEqual(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.getZoomFactor()),1.1,'Ctrl-wheel over actual embedded ChatGPT changes native zoom');
   const trustedZoom=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.getZoomFactor());
   const exposed=await app.evaluate(async({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.executeJavaScript('document.body.dispatchEvent(new WheelEvent("wheel",{ctrlKey:true,deltaY:-100,bubbles:true}));typeof window.dock'));
   assert.equal(exposed,'undefined','Remote ChatGPT cannot access main dock API');await page.waitForTimeout(150);
   assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.getZoomFactor()),trustedZoom,'Untrusted page-generated wheel cannot control zoom');

  }
  await page.locator('#panel-zoom-reset').click();await page.waitForFunction(()=>document.querySelector('#panel-zoom-reset').textContent==='100%');
  if(name==='chatgpt')await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],wc=w.contentView.children[0].webContents;w.focus();wc.focus();wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});});else await page.locator('#exit-panel-fullscreen').click();await page.waitForFunction(()=>!OglePanelView.active&&!document.body.classList.contains('panel-fullscreen'));await page.waitForTimeout(150);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen()),false);
  assert.deepEqual(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds()),before,name+' restores dock bounds');if(name==='terminal')await page.screenshot({path:path.join(profile,'normal-shell.png')});assert.equal(await page.evaluate(()=>state.activePanel),name);
 }
 await page.evaluate(async()=>{await switchPanel('chatgpt');await OglePinnedPanel.pin('chatgpt');});await page.waitForFunction(()=>state.pinnedPanel==='chatgpt'&&!DockLayoutTransition.busy);
 const pinnedBefore=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
 await page.locator('#editor-panel .panel-fullscreen-button').click();await page.waitForFunction(()=>OglePanelView.active==='editor');await page.waitForTimeout(250);
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children[0].getVisible()),false,'Pinned GPT cannot cover fullscreen Editor');
 await page.locator('#exit-panel-fullscreen').press('Escape');await page.waitForFunction(()=>!OglePanelView.active);await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>state.pinnedPanel),'chatgpt');assert.deepEqual(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds()),pinnedBefore);
 console.log('Screenshots: '+profile);
 console.log('PASS seven fullscreen tabs, restored bounds, Ctrl-wheel zoom, native GPT zoom, hidden footer and right-aligned YOU');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
