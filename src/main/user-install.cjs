'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {prepareHandoff}=require('./update-handoff.cjs');
const MARKER='.ogle-user-install.json';
const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const within=(child,parent)=>same(child,parent)||path.resolve(child).toLowerCase().startsWith(path.resolve(parent).toLowerCase()+path.sep);
async function noLinks(directory,{missing=false}={}){
 let current=path.resolve(directory);
 while(current!==path.parse(current).root){try{if((await fs.lstat(current)).isSymbolicLink())throw Error('Installation cannot use junctions or symbolic links.');}catch(error){if(!missing||error.code!=='ENOENT')throw error;}current=path.dirname(current);}
}
async function fileHash(file){const handle=await fs.open(file,'r');const hash=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);try{for(;;){const {bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;hash.update(buffer.subarray(0,bytesRead));}return hash.digest('hex');}finally{await handle.close();}}
async function verifyApplication(directory){await noLinks(directory);const exe=path.join(directory,'Ogle.exe'),asar=path.join(directory,'resources','app.asar');for(const file of [exe,asar]){if((await fs.lstat(file)).isSymbolicLink()||!(await fs.stat(file)).isFile())throw Error('Ogle application files are missing or linked.');}const handle=await fs.open(exe,'r');try{const magic=Buffer.alloc(2);await handle.read(magic,0,2,0);if(magic.toString()!=='MZ')throw Error('Ogle executable is invalid.');}finally{await handle.close();}return {exe,asar};}
async function verifyInstalled(directory){
 const files=await verifyApplication(directory),marker=path.join(directory,MARKER);const info=await fs.lstat(marker);if(info.isSymbolicLink()||info.size>4096)throw Error('Existing installation has no valid Ogle ownership record.');const saved=JSON.parse(await fs.readFile(marker,'utf8'));if(saved.application!=='Ogle'||saved.schema!==1||!/^\d+\.\d+\.\d+$/.test(saved.version||'')||! /^[a-f0-9]{64}$/.test(saved.exeHash||'')||! /^[a-f0-9]{64}$/.test(saved.asarHash||''))throw Error('Existing installation is not managed by Ogle.');if(await fileHash(files.exe)!==saved.exeHash||await fileHash(files.asar)!==saved.asarHash)throw Error('Existing Ogle installation changed. Repair it manually before installing again.');return saved;
}
async function prepareUserInstall({currentExe,dataDir,version,localAppData=process.env.LOCALAPPDATA,startMenuDirectory=process.env.APPDATA&&path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs'),desktopShortcut=false,desktopDirectory=path.join(os.homedir(),'Desktop'),autoStart=false,pid=process.pid,launch=true,handoffPreparer=prepareHandoff}={}){
 if(typeof currentExe!=='string'||path.basename(currentExe).toLowerCase()!=='ogle.exe')throw Error('Install from the packaged Ogle application.');
 if(typeof localAppData!=='string'||!path.isAbsolute(localAppData)||typeof dataDir!=='string'||!path.isAbsolute(dataDir))throw Error('A user application folder and profile folder are required.');
 if(!/^\d+\.\d+\.\d+$/.test(version||''))throw Error('Invalid Ogle installation version.');
 const root=path.join(path.resolve(localAppData),'Ogle'),target=path.join(root,'Application'),source=path.dirname(path.resolve(currentExe)),profile=path.resolve(dataDir);
 if(within(profile,root)||within(root,profile)||within(profile,source)||within(root,source)||within(source,root))throw Error('The installation, portable application and profile must be separate.');
 await noLinks(root,{missing:true});await verifyApplication(source);
 const protectedRoots=[process.env.SystemRoot,process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean);if(protectedRoots.some(folder=>within(root,folder)))throw Error('Install Ogle in your user application folder.');
 let exists=false;try{await fs.lstat(target);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}if(exists)await verifyInstalled(target);
 if(!startMenuDirectory||!path.isAbsolute(startMenuDirectory))throw Error('A user Start menu folder is required.');
 await noLinks(startMenuDirectory,{missing:true});if(desktopShortcut){if(!path.isAbsolute(desktopDirectory))throw Error('Invalid desktop folder.');await noLinks(desktopDirectory,{missing:true});}
 await fs.mkdir(root,{recursive:true});const stage=await fs.mkdtemp(path.join(root,'.stage-'));
 try{
  for(const entry of await fs.readdir(source))await fs.cp(path.join(source,entry),path.join(stage,entry),{recursive:true,force:false,errorOnExist:true,filter:async file=>{if((await fs.lstat(file)).isSymbolicLink())throw Error('The portable application contains a linked file.');return true;}});
  const staged=await verifyApplication(stage),marker={schema:1,application:'Ogle',version,exeHash:await fileHash(staged.exe),asarHash:await fileHash(staged.asar)};await fs.writeFile(path.join(stage,MARKER),JSON.stringify(marker),{flag:'wx'});
  const shortcuts=[{path:path.join(startMenuDirectory,'Ogle.lnk'),name:'Ogle'}];if(desktopShortcut)shortcuts.push({path:path.join(desktopDirectory,'Ogle.lnk'),name:'Ogle'});
  const handoff=await handoffPreparer({currentExe,stagedFolder:stage,dataDir,pid,launch,targetDirectory:target,allowNewTarget:!exists,shortcuts,autoStart,version});
  return {...handoff,targetExe:path.join(target,'Ogle.exe'),stagedFolder:stage,profile,shortcuts,installed:exists};
 }catch(error){const real=await fs.realpath(stage);if(path.dirname(real).toLowerCase()===root.toLowerCase()&&path.basename(real).startsWith('.stage-'))await fs.rm(real,{recursive:true,force:true}).catch(()=>{});throw error;}
}
function installationStatus(currentExe,{localAppData=process.env.LOCALAPPDATA}={}){const targetExe=typeof localAppData==='string'&&path.isAbsolute(localAppData)?path.join(localAppData,'Ogle','Application','Ogle.exe'):null;return {installed:!!targetExe&&typeof currentExe==='string'&&same(currentExe,targetExe),targetExe};}
module.exports={prepareUserInstall,installationStatus,verifyInstalled,verifyApplication,MARKER};





