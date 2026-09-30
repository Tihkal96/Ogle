'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','zoom-scroll-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 const settings={compactChatTarget:'codex',autoStart:false,autoCollapse:false,autoExpand:false};for(const key of require('../src/main/global-shortcuts.cjs').shortcutKeys)settings[key]='';
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify(settings));const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady&&!DockLayoutTransition.busy);
  await app.evaluate(({BrowserWindow,session})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();session.fromPartition('persist:petdock-chatgpt').protocol.handle('https',()=>new Response('<!doctype html><html><body style="margin:0"><main style="height:8000px">Local zoom fixture</main><textarea></textarea></body></html>',{headers:{'content-type':'text/html'}}));});
  const wheel=async(locator,delta,ctrl=true)=>{const b=await locator.boundingBox();await page.mouse.move(b.x+Math.min(100,b.width/2),b.y+Math.min(100,b.height/2));if(ctrl)await page.keyboard.down('Control');await page.mouse.wheel(0,delta);if(ctrl)await page.keyboard.up('Control');await page.waitForTimeout(250);};
  for(const panel of ['notes','editor']){
   await page.evaluate(async panel=>{await switchPanel(panel);await OglePanelView.enter(panel);const text=Array.from({length:300},(_,i)=>'Line '+i+' text for zoom testing').join('\n');if(panel==='notes')document.getElementById('note').value=text;else await PetDockEditor.newFromText(text);},panel);
   const scroller=page.locator(panel==='notes'?'#note':'.cm-scroller').first();await page.waitForTimeout(200);
   await scroller.evaluate(n=>{n.scrollTop=1200;});await page.waitForTimeout(100);
   const before=await scroller.evaluate(n=>n.scrollTop);
   await wheel(scroller,-120);assert.equal(await page.locator('#panel-zoom-reset').textContent(),'110%');
   assert.ok(Math.abs(await scroller.evaluate(n=>n.scrollTop)-before)<2,panel+' Ctrl+wheel enlarges without scrolling');
   await wheel(scroller,120);assert.equal(await page.locator('#panel-zoom-reset').textContent(),'100%');
   assert.ok(Math.abs(await scroller.evaluate(n=>n.scrollTop)-before)<2,panel+' Ctrl+wheel shrinks without scrolling');
   await wheel(scroller,120,false);assert.ok(await scroller.evaluate(n=>n.scrollTop)>before+10,panel+' ordinary wheel still scrolls');
   await page.evaluate(()=>OglePanelView.exit());
  }
  await page.evaluate(async()=>{await switchPanel('chatgpt');await OglePanelView.enter('chatgpt');});await page.waitForTimeout(500);
  const gpt=script=>app.evaluate(async({BrowserWindow},script)=>BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.executeJavaScript(script),script);
  await gpt('scrollTo(0,1200)');
  await app.evaluate(({BrowserWindow})=>{const wc=BrowserWindow.getAllWindows()[0].contentView.children[0].webContents;wc.focus();wc.sendInputEvent({type:'keyDown',keyCode:'Control',modifiers:['control']});wc.sendInputEvent({type:'mouseWheel',x:120,y:100,deltaY:120,canScroll:true,modifiers:['control']});wc.sendInputEvent({type:'keyUp',keyCode:'Control'});});
  await page.waitForFunction(()=>document.getElementById('panel-zoom-reset').textContent==='110%');await page.waitForTimeout(150);
  assert.ok(Math.abs(await gpt('document.scrollingElement.scrollTop')-1200)<2,'Native ChatGPT Ctrl+wheel does not scroll');
  console.log('PASS real Ctrl+wheel preserves Notes/Editor/ChatGPT offsets in both zoom directions; ordinary wheel still scrolls.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
