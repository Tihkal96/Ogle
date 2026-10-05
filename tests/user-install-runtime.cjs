'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),{prepareUserInstall,verifyInstalled}=require('../src/main/user-install.cjs'),{commitHandoff}=require('../src/main/update-handoff.cjs');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
(async()=>{
 if(process.platform!=='win32')return;
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ogle-user-install-runtime-'));let old,newPid;
 try{
  const source=path.join(root,'portable'),profile=path.join(root,'profile'),local=path.join(root,'local'),programs=path.join(root,'StartMenu'),desktop=path.join(root,'Desktop');await fs.mkdir(path.join(source,'resources'),{recursive:true});await fs.mkdir(profile);await fs.writeFile(path.join(profile,'notes.txt'),'preserve profile');await fs.writeFile(path.join(source,'resources','app.asar'),'isolated installer fixture');
  const exe=path.join(source,'Ogle.exe'),code='using System;using System.IO;using System.Threading;public class Stub{public static void Main(){File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"started.txt"),"ready");Thread.Sleep(60000);}}';
  await exec('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from('Add-Type -TypeDefinition '+quote(code)+' -OutputAssembly '+quote(exe)+' -OutputType ConsoleApplication','utf16le').toString('base64')],{windowsHide:true});
  old=spawn(exe,[],{windowsHide:true,stdio:'ignore'});
  const handoff=await prepareUserInstall({currentExe:exe,dataDir:profile,version:'0.7.6',localAppData:local,startMenuDirectory:programs,desktopShortcut:true,desktopDirectory:desktop,pid:old.pid});
  await commitHandoff(handoff);await assert.rejects(fs.access(handoff.target));old.kill();
  let status;for(let i=0;i<150;i++){try{status=JSON.parse((await fs.readFile(handoff.log,'utf8')).replace(/^\uFEFF/,''));break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(status?.state,'updated');newPid=status.pid;await verifyInstalled(handoff.target);assert.equal(await fs.readFile(path.join(profile,'notes.txt'),'utf8'),'preserve profile');await fs.access(exe);
  const command='$shell=New-Object -ComObject WScript.Shell;$paths=@('+handoff.shortcuts.map(shortcut=>quote(shortcut.path)).join(',')+');@($paths|ForEach-Object{$s=$shell.CreateShortcut($_);@{path=$_;target=$s.TargetPath;working=$s.WorkingDirectory}})|ConvertTo-Json -Compress';
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true});const shortcuts=JSON.parse(stdout);assert.equal(shortcuts.length,2);assert.ok(shortcuts.every(shortcut=>shortcut.target.toLowerCase()===handoff.targetExe.toLowerCase()));
  console.log(JSON.stringify({passed:true,newUserInstallation:true,shortcuts:2,portablePreserved:true,profilePreserved:true,oldPidWait:true,ownershipVerified:true}));
 }finally{if(old&&!old.killed)old.kill();if(newPid)await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command','Stop-Process -Id '+newPid+' -ErrorAction SilentlyContinue'],{windowsHide:true});await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
