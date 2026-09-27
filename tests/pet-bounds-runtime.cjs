'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`pet-bounds-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'chatgpt',autoStart:false,autoExpand:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:''}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&!DockLayoutTransition.busy&&state.settings.autoExpand===false);
  const area=await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.hide();w.webContents.setBackgroundThrottling(false);screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});return screen.getPrimaryDisplay().workArea;});
  await page.evaluate(async()=>{state.settings.autoExpand=false;await setMode('reveal');});
  await app.evaluate(({BrowserWindow},area)=>{const w=BrowserWindow.getAllWindows()[0],b=w.getBounds();w.setPosition(area.x+area.width-60-b.width/2,area.y+area.height-128);},area);
  const before=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
  await page.evaluate(async()=>{await setMode('expand');});
  const after=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
  assert.equal(after.x+after.width/2,before.x+before.width/2,'expansion keeps pet center');assert.equal(after.y,before.y,'expansion keeps pet top');
  assert.ok(after.x+after.width>area.x+area.width,'panel extends beyond right edge');assert.ok(after.y+after.height>area.y+area.height,'panel extends below taskbar');
  const canvas=await page.locator('#pet').boundingBox();assert.ok(after.x+canvas.x>=area.x);assert.ok(after.x+canvas.x+canvas.width<=area.x+area.width);assert.ok(after.y+canvas.y>=area.y);assert.ok(after.y+canvas.y+canvas.height<=area.y+area.height);
  // Exercise actual pet drag IPC and monitor-local clamp without moving the real pointer.
  await app.evaluate(({screen})=>{global.fixturePointer={x:500,y:500};screen.getCursorScreenPoint=()=>global.fixturePointer;});
  await page.evaluate(()=>api.petDrag('start'));
  await app.evaluate(({screen})=>{const a=screen.getPrimaryDisplay().workArea;global.fixturePointer={x:a.x+a.width-1,y:a.y+a.height-1};});
  await page.evaluate(async()=>{await api.petDrag('move');await api.petDrag('end');});
  const dragged=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
  assert.ok(dragged.x+canvas.x+canvas.width<=area.x+area.width);assert.ok(dragged.y+canvas.y+canvas.height<=area.y+area.height);
  console.log('Actual dock expansion extends offscreen without moving the pet; canvas and pet-drag IPC stay inside work area.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
