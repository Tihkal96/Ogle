'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`stats-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false,shortcutVisibility:'',shortcutPanel:''}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
  await page.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#activity-stats')&&!DockLayoutTransition.busy);
  await page.waitForFunction(async()=>Boolean((await window.dock.activityStats()).inputAvailable),null,{timeout:20000});
  const stats=await page.evaluate(()=>window.dock.activityStats());assert.deepEqual(Object.keys(stats).sort(),['clicks','cpu','inputAvailable','keys','ram']);assert.equal(stats.inputAvailable,true);assert.ok(stats.cpu>=0&&stats.cpu<=100);assert.ok(stats.ram>0&&stats.ram<=100);
  for(const scale of [.5,1,2])for(const position of ['left','right','top'])for(const mode of ['idle','reveal','expand']){
   await page.evaluate(async({scale,position,mode})=>{Object.assign(state.settings,await api.saveSettings({petScale:scale,statsPosition:position}));applySettings();await setMode(mode);},{scale,position,mode});
   await page.waitForFunction(()=>!DockLayoutTransition.busy);
   const box=await page.evaluate(()=>{const b=document.querySelector('#activity-stats').getBoundingClientRect(),stage=document.querySelector('.pet-stage').getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,stageTop:stage.top,stageBottom:stage.bottom,width:innerWidth,height:innerHeight,color:getComputedStyle(document.querySelector('#activity-stats')).color};});
   assert.ok(box.x>=0&&box.y>=0&&box.right<=box.width+.5&&box.bottom<=box.height+.5,JSON.stringify({scale,position,mode,box}));assert.ok(box.y>=box.stageTop-.5&&box.bottom<=box.stageBottom+.5,JSON.stringify({scale,position,mode,box}));assert.equal(box.color,'rgb(255, 255, 255)');
  }
  await page.evaluate(async()=>{const patch={statsClicks:false,statsKeys:false,statsCpu:false,statsRam:false};Object.assign(state.settings,await api.saveSettings(patch));applySettings();});assert.equal(await page.locator('#activity-stats').isHidden(),true);
  await page.evaluate(async()=>{Object.assign(state.settings,await api.saveSettings({statsRam:true}));applySettings();});assert.equal(await page.locator('#activity-stats > div:visible').count(),1);assert.equal(await page.locator('#activity-stats [data-stat="ram"]').isVisible(),true);assert.equal((await page.evaluate(()=>api.activityStats())).inputAvailable,false);
  console.log('Activity stats: native counter starts without elevation; numeric-only API, all positions at 0.5/1/2 scale in all modes, row toggles and white text passed');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
