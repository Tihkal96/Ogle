'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts',`topmost-${Date.now()}`);fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'main.cjs'),`global.testRequire=require;const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>new BrowserWindow({show:false}).loadURL('about:blank'));`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const app=await electron.launch({args:[path.join(dir,'main.cjs')],env});
try{const result=await app.evaluate(async({BrowserWindow},{root})=>{
const {TopmostController}=global.testRequire(global.testRequire('node:path').join(root,'src/main/topmost-controller.cjs'));
const dock=new BrowserWindow({width:200,height:100,show:false}),other=new BrowserWindow({width:200,height:100,show:false});
await Promise.all([dock.loadURL('about:blank'),other.loadURL('about:blank')]);dock.show();other.show();other.focus();await new Promise(r=>setTimeout(r,150));
const focusedBefore=BrowserWindow.getFocusedWindow()?.id;const controller=new TopmostController(dock,{enabled:true});await new Promise(r=>setTimeout(r,1100));
const focusedAfter=BrowserWindow.getFocusedWindow()?.id,topmost=dock.isAlwaysOnTop();
await new Promise(r=>setTimeout(r,3100));
const childProcess=global.testRequire('node:child_process');
const handle=w=>w.getNativeWindowHandle().readBigUInt64LE().toString();
const dh=handle(dock),oh=handle(other);
const order=()=>{
 const source='using System; using System.Runtime.InteropServices; public class OgleZOrder { [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h); [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint cmd); }';
 const script='Add-Type -TypeDefinition \''+source+'\'; $h=[OgleZOrder]::GetTopWindow([IntPtr]::Zero); while($h -ne [IntPtr]::Zero){$h.ToInt64();$h=[OgleZOrder]::GetWindow($h,2)}';
 return childProcess.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8'}).trim().split(/\s+/);
};
other.setAlwaysOnTop(true);other.moveTop();const overridden=order();
await new Promise(r=>setTimeout(r,2300));const recovered=order();
const lateOverride=overridden.indexOf(oh)<overridden.indexOf(dh),lateRecovery=recovered.indexOf(dh)<recovered.indexOf(oh),lateFocusUnchanged=BrowserWindow.getFocusedWindow()?.id===focusedBefore;
controller.setEnabled(false);const disabled=!dock.isAlwaysOnTop();dock.hide();controller.setEnabled(true);await new Promise(r=>setTimeout(r,1100));const remainsHidden=!dock.isVisible();controller.dispose();dock.destroy();other.destroy();return {focusedBefore,focusedAfter,topmost,disabled,remainsHidden,lateOverride,lateRecovery,lateFocusUnchanged};},{root});
console.log(JSON.stringify(result));assert.equal(result.focusedAfter,result.focusedBefore,'reassert must preserve focused application');assert.equal(result.lateOverride,true,'native other window starts above dock');assert.equal(result.lateRecovery,true,'native dock recovers above late topmost window');assert.equal(result.lateFocusUnchanged,true);assert.equal(result.topmost,true);assert.equal(result.disabled,true);assert.equal(result.remainsHidden,true);
}finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

