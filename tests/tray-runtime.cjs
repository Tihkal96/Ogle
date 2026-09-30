'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','tray-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,autoCollapse:false,compactChatTarget:'codex',statsClicks:false,statsKeys:false}));
 fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'ogle-tray-runtime',main:'main.cjs'}));
 fs.writeFileSync(path.join(profile,'main.cjs'),`const trayModule=require(${JSON.stringify(path.join(root,'src/main/tray.cjs'))});const original=trayModule.createDockTray;trayModule.createDockTray=options=>original({...options,Tray:class extends options.Tray{constructor(...args){super(...args);global.testTray=this;this.popUpContextMenu=menu=>{global.testTrayMenu=menu;};}}});require(${JSON.stringify(path.join(root,'src/main/main.cjs'))});`);
 execFileSync(process.execPath,['--check',path.join(profile,'main.cjs')],{windowsHide:true});
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[profile],env});let closed=false;
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady);
  assert.equal(await app.evaluate(()=>global.testTray.isDestroyed()),false);
  const handle=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString());
  const script="$ProgressPreference='SilentlyContinue';Add-Type 'using System;using System.Runtime.InteropServices;public class TrayStyle{[DllImport(\"user32.dll\",EntryPoint=\"GetWindowLongPtrW\")]public static extern IntPtr Get(IntPtr h,int n);}';[TrayStyle]::Get([IntPtr]::new([long]"+handle+"),-20).ToInt64()";
  const style=Number(execFileSync('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true}).trim());
  console.log({windowStyle:style});assert.equal(style&0x40000,0,'No Windows app/taskbar style');
  await app.evaluate(()=>{testTray.emit('right-click');testTrayMenu.items.find(x=>x.label==='Hide Ogle').click();});
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  await app.evaluate(()=>{testTray.emit('click');testTray.emit('click');});
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),true);
  await page.evaluate(()=>api.windowAction('minimize'));
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  await app.evaluate(()=>{testTray.emit('right-click');testTrayMenu.items.find(x=>x.label==='Settings').click();});
  await page.waitForFunction(()=>state.activePanel==='settings'&&state.mode==='expand');
  await page.evaluate(()=>{window.oldFlush=flushLocal;flushLocal=async()=>{throw new Error('Simulated save failure');};});
  await app.evaluate(()=>{testTray.emit('right-click');testTrayMenu.items.find(x=>x.label==='Quit Ogle').click();});
  await page.waitForTimeout(100);assert.equal(await app.evaluate(()=>testTray.isDestroyed()),false,'Failed save keeps tray available');
  await page.evaluate(()=>{flushLocal=oldFlush;document.querySelector('#note').value='saved by tray quit';document.querySelector('#note').dispatchEvent(new Event('input',{bubbles:true}));});
  const quit=app.waitForEvent('close');await app.evaluate(()=>{setTimeout(()=>{testTray.emit('right-click');testTrayMenu.items.find(x=>x.label==='Quit Ogle').click();},0);});await quit;closed=true;
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'settings.json'))).note,'saved by tray quit');
  console.log('Native tray created, no app-window style, hide/show repeated clicks, minimize recovery, Settings and graceful Quit passed.');
 }finally{if(!closed){await app.evaluate(()=>{testTray?.destroy();}).catch(()=>{});await app.close().catch(()=>{});}}
})().catch(error=>{console.error(error);process.exitCode=1;});
