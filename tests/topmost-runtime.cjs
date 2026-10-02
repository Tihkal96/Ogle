'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts',`topmost-${Date.now()}`);fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'main.cjs'),`global.testRequire=require;const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>new BrowserWindow({show:false}).loadURL('about:blank'));`);
require('node:child_process').execFileSync(process.execPath,['--check',path.join(dir,'main.cjs')]);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const app=await electron.launch({args:[path.join(dir,'main.cjs')],env});
try{const result=await app.evaluate(async({BrowserWindow},{root})=>{
const {TopmostController}=global.testRequire(global.testRequire('node:path').join(root,'src/main/topmost-controller.cjs'));
const dock=new BrowserWindow({width:200,height:100,show:false}),other=new BrowserWindow({width:200,height:100,show:false});
await Promise.all([dock.loadURL('about:blank'),other.loadURL('about:blank')]);dock.show();other.show();other.focus();await new Promise(r=>setTimeout(r,150));
const controller=new TopmostController(dock,{enabled:true});for(let i=0;i<60&&typeof controller.fullscreen!=='boolean';i++)await new Promise(r=>setTimeout(r,100));if(typeof controller.fullscreen!=='boolean')throw new Error('Native fullscreen monitor did not initialize');
// A real fullscreen application may intentionally retain foreground ownership.
// Respect it and verify yielding directly instead of mislabeling true as failure.
if(controller.fullscreen){const started=Date.now();let remainsBelow=true;while(controller.fullscreen&&Date.now()-started<2600){if(dock.isAlwaysOnTop())remainsBelow=false;await new Promise(r=>setTimeout(r,50));}const result={ambientFullscreen:true,remainsBelow,ambientFullscreenEnded:!controller.fullscreen,observedMs:Date.now()-started};controller.dispose();dock.destroy();other.destroy();return result;}
other.focus();await new Promise(r=>setTimeout(r,150));const focusedBefore=BrowserWindow.getFocusedWindow()?.id;controller.reassert();await new Promise(r=>setTimeout(r,150));const focusedAfter=BrowserWindow.getFocusedWindow()?.id,topmost=dock.isAlwaysOnTop();
await new Promise(r=>setTimeout(r,3100));
const childProcess=global.testRequire('node:child_process');
const handle=w=>w.getNativeWindowHandle().readBigUInt64LE().toString();
const dh=handle(dock),oh=handle(other);
const order=()=>{
 const source='using System; using System.Runtime.InteropServices; public class OgleZOrder { [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h); [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint cmd); }';
 const script='Add-Type -TypeDefinition \''+source+'\'; $h=[OgleZOrder]::GetTopWindow([IntPtr]::Zero); while($h -ne [IntPtr]::Zero){$h.ToInt64();$h=[OgleZOrder]::GetWindow($h,2)}';
 return childProcess.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8'}).trim().split(/\s+/);
};
other.setAlwaysOnTop(true);other.moveTop();const overridden=order();other.focus();await new Promise(r=>setTimeout(r,150));
let guardFocusEvents=0;const guardFocus=()=>{guardFocusEvents++;};dock.on('focus',guardFocus);
await new Promise(r=>setTimeout(r,2300));dock.removeListener('focus',guardFocus);const lateFocusUnchanged=guardFocusEvents===0;const recovered=order();
const lateOverride=overridden.indexOf(oh)<overridden.indexOf(dh),lateRecovery=recovered.indexOf(dh)<recovered.indexOf(oh);
// An external native borderless window models a browser video/game. It must
// remain above Ogle for longer than the former two-second recovery interval.
const script="Add-Type -AssemblyName System.Windows.Forms; Add-Type 'using System;using System.Runtime.InteropServices;public class ForegroundProbe{[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();}'; $f=New-Object Windows.Forms.Form; $f.FormBorderStyle=\"None\"; $f.WindowState=\"Maximized\"; $f.TopMost=$true; $timer=New-Object Windows.Forms.Timer; $timer.Interval=100; $watch=[Diagnostics.Stopwatch]::StartNew(); $timer.Add_Tick({[Console]::WriteLine(\"F|\"+([ForegroundProbe]::GetForegroundWindow() -eq $f.Handle));[Console]::Out.Flush();if($watch.ElapsedMilliseconds -gt 8500){$f.Close()}}); $f.Add_Shown({$f.Activate();$watch.Restart();$timer.Start()}); [Windows.Forms.Application]::Run($f)";
const video=childProcess.spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let yielded=false,stayedBelow=false,restored=false,foreground=false,lastForegroundAt=0,foregroundSince=0,longestForegroundMs=0,violations=0,foregroundLosses=0,output='';
video.stdout.on('data',chunk=>{output+=chunk.toString();let end;while((end=output.indexOf('\n'))>=0){const line=output.slice(0,end).trim();output=output.slice(end+1);if(!/^F\|(True|False)$/.test(line))continue;const now=Date.now(),active=line==='F|True';if(active&&!foreground)foregroundSince=now;if(!active&&foreground)foregroundLosses++;foreground=active;lastForegroundAt=now;}});
video.stderr.on('data',()=>{});
try {
 const deadline=Date.now()+13000;
 while(video.exitCode===null&&Date.now()<deadline){
   await new Promise(r=>setTimeout(r,50));const now=Date.now();
   if(!foreground||now-lastForegroundAt>300)continue;
   const duration=now-foregroundSince;longestForegroundMs=Math.max(longestForegroundMs,duration);
   // Allow the documented 250ms native sampling interval to catch entry.
   // After that, a topmost dock over a continuously foreground fixture is a defect.
   if(duration>500){if(dock.isAlwaysOnTop())violations++;else yielded=true;}
   if(duration>2600&&violations===0)stayedBelow=true;
 }
 if(video.exitCode===null)throw new Error('Fullscreen fixture did not finish');
 for(let i=0;i<40&&controller.fullscreen;i++)await new Promise(r=>setTimeout(r,100));
 restored=controller.fullscreen===false&&dock.isAlwaysOnTop();
} finally {if(video.exitCode===null)video.kill();}
const fullscreenInterrupted=!stayedBelow&&violations===0;
controller.setEnabled(false);const disabled=!dock.isAlwaysOnTop();dock.hide();controller.setEnabled(true);await new Promise(r=>setTimeout(r,1100));const remainsHidden=!dock.isVisible();controller.dispose();dock.destroy();other.destroy();return {focusedBefore,focusedAfter,topmost,disabled,remainsHidden,lateOverride,lateRecovery,lateFocusUnchanged,yielded,stayedBelow,restored,fullscreenInterrupted,foregroundLosses,longestForegroundMs,violations};},{root:process.env.PETDOCK_TEST_EXE?path.join(path.dirname(process.env.PETDOCK_TEST_EXE),'resources/app.asar'):root});
console.log(JSON.stringify(result));if(result.ambientFullscreen){assert.equal(result.remainsBelow,true);if(result.ambientFullscreenEnded)console.log('Ambient fullscreen ended during observation; sustained fullscreen assertion is inconclusive.');return;}assert.equal(result.violations,0,'dock rose above a continuously foreground fullscreen fixture');if(!result.fullscreenInterrupted){assert.equal(result.yielded,true);assert.equal(result.stayedBelow,true);assert.equal(result.restored,true);}else console.log('Fullscreen fixture interrupted by another foreground window; sustained fullscreen assertion is inconclusive.');assert.equal(result.focusedAfter,result.focusedBefore,'reassert must preserve focused application');assert.equal(result.lateOverride,true,'native other window starts above dock');assert.equal(result.lateRecovery,true,'native dock recovers above late topmost window');assert.equal(result.lateFocusUnchanged,true);assert.equal(result.topmost,true);assert.equal(result.disabled,true);assert.equal(result.remainsHidden,true);
}finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
