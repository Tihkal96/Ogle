'use strict';
const net=require('node:net');
const {execFile}=require('node:child_process');
function desktopPipeReady() {
  return new Promise(resolve=>{
    const socket=net.connect('\\\\.\\pipe\\codex-ipc');let finished=false;
    const done=value=>{if(finished)return;finished=true;clearTimeout(timer);socket.destroy();resolve(value);};
    const timer=setTimeout(()=>done(false),500);
    socket.once('connect',()=>done(true));socket.once('error',()=>done(false));
  });
}
function desktopProcessRunning() {
  const script="[bool]@(Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Where-Object { $_.Path -match '[\\\\/]OpenAI[.]Codex_|[\\\\/]OpenAI[\\\\/]Codex[\\\\/]' -and $_.Path -notmatch '[\\\\/]bin[\\\\/]|[\\\\/]resources[\\\\/]' }).Count";
  return new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:5000},(error,stdout)=>resolve(!error&&stdout.trim().toLowerCase()==='true')));
}
function configureStartup(app,enabled,{isolated=Boolean(process.env.PETDOCK_DATA_DIR),executable=process.execPath}={}) {
  if(isolated||!app.isPackaged||process.platform!=='win32')return {enabled,applied:false};
  app.setLoginItemSettings({openAtLogin:enabled,path:executable,args:['--autostart']});
  return {enabled,applied:true};
}
async function ensureCodex({ready=desktopPipeReady,running=desktopProcessRunning,open,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  // Let Codex's own startup entry finish before considering a launch.
  for(let attempt=0;attempt<6;attempt++){if(await ready())return {opened:false,reason:'connected'};if(attempt<5)await wait(1500);}
  if(await running())return {opened:false,reason:'already-starting'};
  await open('codex://');return {opened:true};
}
module.exports={configureStartup,ensureCodex,desktopPipeReady,desktopProcessRunning};
