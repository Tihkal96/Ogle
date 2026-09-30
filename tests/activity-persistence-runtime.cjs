'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {localDate}=require('../src/main/activity-stats.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`stats-persistence-${Date.now()}`),totalsFile=path.join(profile,'activity-totals.json');
 fs.mkdirSync(profile,{recursive:true});
 // No counters need to be active to preserve and restore today's totals. This
 // avoids any dependence on the user's concurrent keyboard/mouse activity.
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false,statsClicks:false,statsKeys:false,statsCpu:false,statsRam:false,statsCpuTemp:false,statsGpu:false,statsGpuClock:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:''}));
 fs.writeFileSync(totalsFile,JSON.stringify({date:localDate(new Date()),clicks:12345,keys:67890}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 async function cycle(expected){
  const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
  let quitting=false;
  try{
   await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.hide();app.on('browser-window-created',(_,w)=>{w.hide();w.on('show',()=>w.hide());});});
   const page=await app.firstWindow();await page.waitForFunction(()=>typeof window.dock?.activityStats==='function');
   const value=await page.evaluate(()=>window.dock.activityStats());assert.equal(value.clicks,expected.clicks);assert.equal(value.keys,expected.keys);assert.equal(value.inputAvailable,false);
   // Exercise the application's before-quit cleanup, not a forced process kill.
   const exited=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Graceful quit timed out')),12000);app.process().once('exit',code=>{clearTimeout(timeout);resolve(code);});});
   quitting=true;await app.evaluate(({app})=>{setTimeout(()=>app.quit(),0);});assert.equal(await exited,0);
  }finally{if(!quitting)await app.close();}
 }
 await cycle({clicks:12345,keys:67890});assert.deepEqual(JSON.parse(fs.readFileSync(totalsFile)),{date:localDate(new Date()),clicks:12345,keys:67890});
 await cycle({clicks:12345,keys:67890});
 const previous=new Date();previous.setDate(previous.getDate()-1);fs.writeFileSync(totalsFile,JSON.stringify({date:localDate(previous),clicks:99999,keys:88888}));
 await cycle({clicks:0,keys:0});
 console.log('Packaged daily counters: same-day restore, graceful quit, restart preservation and previous-day reset passed in isolated hidden profile; no input injected');
})().catch(error=>{console.error(error);process.exitCode=1;});
