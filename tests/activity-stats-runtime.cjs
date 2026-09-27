'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`stats-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:''}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
  await page.waitForFunction(()=>typeof state!=='undefined'&&document.querySelector('#activity-stats')&&!DockLayoutTransition.busy);
  await page.waitForFunction(async()=>Boolean((await window.dock.activityStats()).inputAvailable),null,{timeout:20000});
  const stats=await page.evaluate(()=>window.dock.activityStats());assert.deepEqual(Object.keys(stats).sort(),['clicks','cpu','inputAvailable','keys','ram']);assert.equal(stats.inputAvailable,true);assert.ok(stats.cpu>=0&&stats.cpu<=100);assert.ok(stats.ram>0&&stats.ram<=100);
  assert.equal(await page.evaluate(()=>state.settings.statsBackground),false);
  await app.evaluate(({Menu})=>{global.metricMenu=null;const build=Menu.buildFromTemplate;Menu.buildFromTemplate=items=>{global.metricMenu=items;return {popup(){}};};global.restoreMetricMenu=()=>{Menu.buildFromTemplate=build;};});
  await page.evaluate(()=>api.petMenu());
  await app.evaluate(()=>{const item=global.metricMenu.find(x=>x.label==='Show metrics');if(!item||!item.checked)throw new Error('Missing checked metrics menu');item.click({checked:false});});
  await page.waitForFunction(()=>document.querySelector('#activity-stats').hidden);
  assert.equal(await page.evaluate(()=>state.settings.statsClicks),true);
  await page.evaluate(()=>api.petMenu());await app.evaluate(()=>{const item=global.metricMenu.find(x=>x.label==='Show metrics');if(item.checked)throw new Error('Stale menu checked state');item.click({checked:true});global.restoreMetricMenu();});
  await page.waitForFunction(()=>!document.querySelector('#activity-stats').hidden);
  await page.evaluate(()=>switchPanel('settings'));await page.locator('[data-setting="statsBackground"]').check();await page.evaluate(()=>saveQueue);
  await page.locator('[data-setting="statsTextTransparency"]').fill('40');await page.locator('[data-setting="statsTextTransparency"]').dispatchEvent('change');await page.evaluate(()=>saveQueue);
  await page.locator('[data-setting="statsBackgroundTransparency"]').fill('70');await page.locator('[data-setting="statsBackgroundTransparency"]').dispatchEvent('change');await page.evaluate(()=>saveQueue);
  const appearance=await page.locator('#activity-stats').evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,right:getComputedStyle(el).right}));
  assert.equal(appearance.color,'rgba(255, 255, 255, 0.6)');assert.equal(appearance.background,'rgba(0, 0, 0, 0.3)');assert.equal(appearance.right,'5px');
  await page.evaluate(async()=>{Object.assign(state.settings,await api.saveSettings({statsBackground:false,statsTextTransparency:0}));applySettings();});
  for(const scale of [.5,1,2])for(const position of ['left','right','top'])for(const mode of ['idle','reveal','expand']){
   await page.evaluate(async({scale,position,mode})=>{Object.assign(state.settings,await api.saveSettings({petScale:scale,statsPosition:position}));applySettings();await setMode(mode);},{scale,position,mode});
   await page.waitForFunction(()=>!DockLayoutTransition.busy);
   const box=await page.evaluate(()=>{const b=document.querySelector('#activity-stats').getBoundingClientRect(),stage=document.querySelector('.pet-stage').getBoundingClientRect(),shell=document.querySelector('.shell').getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,stageTop:stage.top,stageBottom:stage.bottom,shellLeft:shell.left,shellRight:shell.right,width:innerWidth,height:innerHeight,color:getComputedStyle(document.querySelector('#activity-stats')).color};});
   assert.ok(box.x>=0&&box.y>=0&&box.right<=box.width+.5&&box.bottom<=box.height+.5,JSON.stringify({scale,position,mode,box}));assert.ok(box.y>=box.stageTop-.5&&box.bottom<=box.stageBottom+.5,JSON.stringify({scale,position,mode,box}));assert.ok(box.x-2>=box.shellLeft&&box.right+2<=box.shellRight,JSON.stringify({scale,position,mode,box}));assert.equal(box.color,'rgb(255, 255, 255)');
  }
  await page.evaluate(async()=>{const patch={statsClicks:false,statsKeys:false,statsCpu:false,statsRam:false};Object.assign(state.settings,await api.saveSettings(patch));applySettings();});assert.equal(await page.locator('#activity-stats').isHidden(),true);
  await page.evaluate(async()=>{Object.assign(state.settings,await api.saveSettings({statsRam:true}));applySettings();});assert.equal(await page.locator('#activity-stats > div:visible').count(),1);assert.equal(await page.locator('#activity-stats [data-stat="ram"]').isVisible(),true);assert.equal((await page.evaluate(()=>api.activityStats())).inputAvailable,false);
  console.log('Activity stats: native counter starts without elevation; numeric-only API, all positions at 0.5/1/2 scale in all modes, bar-edge bounds including background outline, row toggles, native menu toggle, transparency settings and white text passed');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
