"use strict";
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`pinned-panel-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,autoCollapseDelay:1000,compactChatTarget:'codex',shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:''}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForFunction(()=>typeof state!=='undefined'&&state.settings.autoCollapseDelay===1000&&!DockLayoutTransition.busy);
 await app.evaluate(({BrowserWindow,screen,ipcMain})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.showInactive();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});global.gptLayout=null;ipcMain.removeHandler('dock:openChatGPT');ipcMain.handle('dock:openChatGPT',()=>({}));ipcMain.removeHandler('dock:chatgptLayout');ipcMain.handle('dock:chatgptLayout',(_e,value)=>{global.gptLayout=value;});});
 await page.evaluate(()=>switchPanel('editor'));await page.waitForFunction(()=>!DockLayoutTransition.busy);
 await page.locator('#editor-panel .cm-content').fill('Keep this text while pinning.');
 page.on('pageerror',err=>console.error('Renderer:',err.message));
 for(const name of ['editor','chats','chatgpt','terminal','shortcuts']){
   console.log('Checking',name);
   await page.evaluate(name=>switchPanel(name),name);await page.waitForFunction(()=>!DockLayoutTransition.busy);
   await page.locator(`[data-panel="${name}"]`).click({button:'right'});await page.getByRole('menuitem',{name:'Pin',exact:true}).click();
   await page.waitForFunction(name=>state.pinnedPanel===name&&!DockLayoutTransition.busy,name);
   assert.equal(await page.evaluate(()=>state.activePanel),name==='editor'?'terminal':'editor');
   assert.equal(await page.locator(`#${name}-panel`).evaluate(el=>el.parentElement.id),'side-panel-content');
   assert.equal(await page.locator(`#${name}-panel`).isVisible(),true);
   if(name==='chats')assert.equal(await page.locator('#composer').evaluate(el=>el.parentElement.id),'side-panel-content');
   for(const side of ['left','right','bottom']){
     console.log('Placement',name,side);
     await page.evaluate(async side=>{await save({pinnedPanelSide:side});applySettings();},side);
     await page.waitForFunction(side=>document.body.dataset.pinnedSide===side&&!DockLayoutTransition.busy,side);
     const geometry=await page.evaluate(()=>{const a=document.querySelector('.shell').getBoundingClientRect(),b=document.querySelector('#side-panel').getBoundingClientRect();return {a:{x:a.x,y:a.y,right:a.right,bottom:a.bottom},b:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},width:innerWidth,height:innerHeight};});
     if(side==='left')assert.ok(geometry.b.right<=geometry.a.x);else if(side==='right')assert.ok(geometry.a.right<=geometry.b.x);else assert.ok(geometry.a.bottom<=geometry.b.y);
     assert.ok(geometry.b.right<=geometry.width && geometry.b.bottom<=geometry.height);
     if(name==='chatgpt'){await page.waitForFunction(()=>!DockLayoutTransition.busy);const layout=await app.evaluate(()=>global.gptLayout);assert.equal(layout.visible,true);assert.ok(layout.bounds.width>0&&layout.bounds.height>0);}
   }
   await page.evaluate(()=>{state.settings.autoExpand=true;state.settings.autoCollapse=true;state.pointerInside=false;state.nativePointerInside=false;resetPanelIdle();return collapse(true);});await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>state.mode),'expand');
   await page.evaluate(()=>{state.settings.autoExpand=false;state.settings.autoCollapse=false;});
   await page.getByRole('button',{name:'Unpin panel',exact:true}).click();await page.waitForFunction(()=>!state.pinnedPanel&&!DockLayoutTransition.busy);
   assert.equal(await page.locator(`#${name}-panel`).evaluate(el=>el.parentElement.id),'expanded');
 }
 await page.evaluate(()=>switchPanel('editor'));await page.waitForFunction(()=>!DockLayoutTransition.busy);assert.equal(await page.locator('#editor-panel .cm-content').innerText(),'Keep this text while pinning.');
 await page.screenshot({path:path.join(root,'artifacts','pinned-main.png')});
 await page.locator('[data-panel="editor"]').click({button:'right'});await page.getByRole('menuitem',{name:'Pin',exact:true}).click();await page.waitForFunction(()=>state.pinnedPanel==='editor'&&!DockLayoutTransition.busy);await page.evaluate(async()=>{await save({pinnedPanelSide:'left'});applySettings();});await page.waitForFunction(()=>document.body.dataset.pinnedSide==='left'&&!DockLayoutTransition.busy);await page.screenshot({path:path.join(root,'artifacts','pinned-side.png')});
 await page.evaluate(()=>OglePinnedPanel.unpin());await page.evaluate(()=>switchPanel('notes'));await page.evaluate(()=>OglePinnedPanel.pin('chats'));assert.equal(await page.evaluate(()=>state.activePanel),'notes','Pinning another tab preserves the main tab');await page.evaluate(()=>OglePinnedPanel.unpin());
 console.log('All five pinned panels, left/right/bottom placement, collapse hold, Codex composer, ChatGPT bounds, unpin and editor preservation passed.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
