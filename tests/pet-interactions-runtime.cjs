'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`pet-interactions-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'chatgpt',autoStart:false,autoExpand:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:''}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
  await page.waitForFunction(()=>typeof state!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
  await page.evaluate(()=>{state.running.set('fixture','turn');updateComposer();return setMode('quick');});
  assert.equal(await page.locator('#conversation-name').textContent(),'Write a prompt to ChatGPT...');
  await page.locator('#prompt').focus();
  await page.waitForFunction(()=>$('pet').dataset.state==='watching');
  const direction=await page.locator('#pet').getAttribute('data-frame');
  await page.evaluate(()=>onEvent({type:'pointer',inside:false,x:-99999,y:-99999}));
  await page.waitForTimeout(60);assert.equal(await page.locator('#pet').getAttribute('data-frame'),direction,'Typing follows caret, not mouse');
  await page.evaluate(()=>{$('prompt').blur();$('pet').dispatchEvent(new MouseEvent('mouseenter'));});
  await page.waitForFunction(()=>$('pet').dataset.state==='waving');
  await page.evaluate(()=>$('pet').dispatchEvent(new MouseEvent('mouseleave')));
  await page.waitForFunction(()=>$('pet').dataset.state==='running');
  // Feed movement into the actual pet pointer handler without moving the user's window.
  for(const [x,expected] of [[80,'running-left'],[140,'running-right']]){
   await page.evaluate(x=>{petPress={x:100,y:100,lastX:100};$('pet').dispatchEvent(new PointerEvent('pointermove',{screenX:x,screenY:100}));petPress=null;},x);
   await page.waitForFunction(expected=>$('pet').dataset.state===expected,expected);
   await page.waitForFunction(()=>$('pet').dataset.state==='running');
  }
  await page.evaluate(async()=>{state.settings.autoExpand=true;state.settings.autoCollapse=true;state.settings.autoCollapseDelay=1000;state.panelPinned=false;await setMode('expand');onEvent({type:'pointer',inside:true,x:20,y:20});});
  await page.waitForTimeout(1300);assert.equal(await page.evaluate(()=>state.mode),'expand','Expanded panel stays open under a stationary pointer (including native child view)');
  await page.evaluate(()=>onEvent({type:'pointer',inside:false,x:-1,y:-1}));
  await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>state.mode),'expand','Exit starts a fresh full delay');
  await page.waitForFunction(()=>state.mode==='reveal');
  await page.waitForFunction(()=>state.mode==='idle');
  console.log('Working pet hover/left/right recovery, quick prompt directional watching, ChatGPT label, expanded pointer hold and staged collapse passed');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
