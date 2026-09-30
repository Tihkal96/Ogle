'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','window-shape-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,autoCollapse:false,compactChatTarget:'codex'}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady&&!DockLayoutTransition.busy);
  // Read Windows' actual hit-testing result, not a duplicate of our JS geometry.
  const native=path.join(profile,'hit-test.ps1');fs.writeFileSync(native,`param([int]$px,[int]$py)
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class HitTest {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint id);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 public static uint Owner(int x,int y) {SetProcessDPIAware();uint id;GetWindowThreadProcessId(WindowFromPoint(new Point{X=x,Y=y}),out id);return id;}
}
'@
[HitTest]::Owner($px,$py)
`);
  for(const mode of ['idle','reveal','expand']){
   await page.evaluate(async mode=>{await setMode(mode);await OgleWindowShape.update();},mode);await page.waitForTimeout(150);
   const points=await page.evaluate(()=>{const p=$('pet').getBoundingClientRect(),s=document.querySelector(state.mode==='idle'?'#bar-orb':'.shell').getBoundingClientRect();return {empty:{x:4,y:Math.max(15,p.y+40)},pet:{x:p.x+p.width/2,y:p.y+p.height/2},control:{x:s.x+s.width/2,y:s.y+10}};});
   const data=await app.evaluate(({BrowserWindow,screen},points)=>{const w=BrowserWindow.getAllWindows()[0],b=w.getBounds();w.setAlwaysOnTop(true);w.show();return {pid:process.pid,points:Object.fromEntries(Object.entries(points).map(([k,p])=>[k,screen.dipToScreenPoint({x:Math.round(b.x+p.x),y:Math.round(b.y+p.y)})]))};},points);
   for(const [kind,p] of Object.entries(data.points)){
    const owner=Number(execFileSync('powershell.exe',['-NoProfile','-File',native,String(p.x),String(p.y)],{encoding:'utf8',windowsHide:true}).trim());
    if(kind==='empty')assert.notEqual(owner,data.pid,`${mode}: empty space passes native hit-testing through`);
    else assert.equal(owner,data.pid,`${mode}: ${kind} remains clickable`);
   }
  }
  await page.evaluate(async()=>{await setMode('reveal');openChatTargetMenu();await OgleWindowShape.update();});
  assert.equal(await page.evaluate(()=>{const m=$('chat-target-menu').getBoundingClientRect();return OgleWindowShape.rectangles().some(r=>r.x<=m.x&&r.y<=m.y&&r.x+r.width>=m.right&&r.y+r.height>=m.bottom);}),true,'Chat target popup above the bar remains visible and clickable');
  await page.evaluate(async()=>{closeChatTargetMenu();await switchPanel('notes');await save({petScale:1.5});applySettings();await OglePinnedPanel.pin('editor');});await page.waitForFunction(()=>!DockLayoutTransition.busy);
  const kept=await page.evaluate(async()=>{await OgleWindowShape.update();return OgleWindowShape.rectangles().some(r=>{const s=$('side-panel').getBoundingClientRect();return r.x<=s.x&&r.x+r.width>=s.right;});});assert.equal(kept,true,'Pinned side panel is included');
  console.log('Windows native hit-testing passes through empty space in ball, bar and expanded modes; pet, toolbar and pinned panel stay usable.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
