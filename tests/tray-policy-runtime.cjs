'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts',`tray-policy-${Date.now()}`);fs.mkdirSync(dir,{recursive:true});
 const main=path.join(dir,'main.cjs');
 fs.writeFileSync(main,`global.testRequire=require;const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>new BrowserWindow({show:false}).loadURL('about:blank'));`);
 cp.execFileSync(process.execPath,['--check',main]);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[main],env});
 try{
  await app.firstWindow();
  const result=await app.evaluate(async({app,BrowserWindow},{root})=>{
   const calls=[],native=BrowserWindow.prototype.setSkipTaskbar;
   BrowserWindow.prototype.setSkipTaskbar=function(value){calls.push({id:this.id,value});return native.call(this,value);};
   const req=global.testRequire,dispose=req(req('node:path').join(root,'src/main/tray.cjs')).installTrayOnlyWindows(app,BrowserWindow);
   const dock=BrowserWindow.getAllWindows()[0],popup=new BrowserWindow({show:false,width:220,height:100});
   await popup.loadURL('about:blank');dock.showInactive();popup.showInactive();
   dock.hide();dock.showInactive();popup.minimize();popup.restore();
   await new Promise(resolve=>setTimeout(resolve,250));
   const result={dock:dock.id,popup:popup.id,calls};
   dock.destroy();popup.destroy();dispose();BrowserWindow.prototype.setSkipTaskbar=native;return result;
  },{root:process.env.PETDOCK_TEST_EXE?path.join(path.dirname(process.env.PETDOCK_TEST_EXE),'resources/app.asar'):root});
  assert.ok(result.calls.every(call=>call.value===true));
  assert.ok(result.calls.filter(call=>call.id===result.dock).length>=3,'existing dock creation and repeated showing');
  assert.ok(result.calls.filter(call=>call.id===result.popup).length>=3,'new child creation, show, restore');
  console.log(JSON.stringify(result));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
