'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`responsive-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
 await page.waitForFunction(()=>typeof messageView!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);

 await page.evaluate(()=>{state.selected={id:'draft-task',name:'Draft task'};state.settings.drafts={'draft-task':'Codex draft',__chatgpt__:'GPT draft'};return setMode('quick');});
 assert.equal(await page.locator('#prompt').inputValue(),'Codex draft');
 await page.locator('#conversation-name').click({button:'right'});
 assert.equal(await page.locator('#chat-target-menu').isVisible(),true);
 await page.locator('[data-chat-target="chatgpt"]').click();
 await page.waitForFunction(()=>state.settings.compactChatTarget==='chatgpt'&&$('chat-target-menu').hidden);
 assert.equal(await page.locator('#conversation-name').textContent(),'Write prompt…');
 assert.equal(await page.locator('#prompt').inputValue(),'GPT draft');
 assert.equal(await page.locator('#conversation-picker-toggle').isHidden(),true);
 await page.locator('#chat-target-toggle').click();
 // The upper menu item overlaps the native draggable pet stage. DOM clicks
 // bypass that Windows hit-test, so assert the no-drag region and use pointer clicks.
 assert.equal(await page.locator('#chat-target-menu').evaluate(el=>getComputedStyle(el).webkitAppRegion),'no-drag');
 assert.equal(await page.locator('[data-chat-target="codex"]').evaluate(el=>getComputedStyle(el).webkitAppRegion),'no-drag');
 await page.locator('[data-chat-target="codex"]').click();
 await page.waitForFunction(()=>state.settings.compactChatTarget==='codex'&&$('chat-target-menu').hidden);
 assert.equal(await page.locator('#prompt').inputValue(),'Codex draft');
 assert.equal(await page.locator('#conversation-picker-toggle').isVisible(),true);
 // Both choices also work in the horizontal-only bar, with the upper item
 // extending into the pet stage rather than a quick-compose panel.
 await page.evaluate(()=>setMode('reveal'));
 for(const target of ['chatgpt','codex']){
  await page.locator('#chat-target-toggle').click();
  const geometry=await page.locator('[data-chat-target="codex"]').evaluate(el=>({top:el.getBoundingClientRect().top,stageBottom:document.querySelector('.pet-stage').getBoundingClientRect().bottom}));
  assert.ok(geometry.top<geometry.stageBottom,'upper destination row overlaps the draggable stage');
  await page.locator(`[data-chat-target="${target}"]`).click();
  await page.waitForFunction(value=>state.settings.compactChatTarget===value&&$('chat-target-menu').hidden,target);
 }
 await page.locator('#chat-target-toggle').click();
 await page.evaluate(()=>setMode('idle'));
 assert.equal(await page.locator('#chat-target-menu').isHidden(),true);
 await page.evaluate(()=>saveQueue);
 assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'settings.json'))).compactChatTarget,'codex');
 console.log('Chat target menu, label, separate drafts, persistence and collapse passed');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
