'use strict';
const fs=require('node:fs'),path=require('node:path');
// Stage in the same directory, flush contents, then atomically replace the target.
function durableWrite(file,text,{keepPrevious=false}={}){
 fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.tmp';let handle;
 try{handle=fs.openSync(temporary,'w',0o600);fs.writeFileSync(handle,text,'utf8');fs.fsyncSync(handle);}finally{if(handle!==undefined)fs.closeSync(handle);}
 if(keepPrevious){try{const current=fs.readFileSync(file,'utf8'),parsed=JSON.parse(current);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))durableWrite(file+'.previous',current);}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}}
 fs.renameSync(temporary,file);
 // Windows does not support fsync on directory handles; POSIX can persist rename.
 if(process.platform!=='win32'){let dir;try{dir=fs.openSync(path.dirname(file),'r');fs.fsyncSync(dir);}finally{if(dir!==undefined)fs.closeSync(dir);}}
}
function readRecovery(file){
 let primaryError=null;
 try{const bytes=fs.readFileSync(file);try{const staged=fs.readFileSync(file+'.tmp'),parsed=JSON.parse(staged.toString('utf8'));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&fs.statSync(file+'.tmp').mtimeMs>=fs.statSync(file).mtimeMs&&!staged.equals(bytes))return {bytes:staged,source:'.tmp',info:{source:'.tmp',message:'Recovered a newer autosave from an interrupted write.'}};}catch{}return {bytes,source:'primary',info:null};}catch(error){primaryError=error;}
 if(primaryError.code!=='ENOENT')throw primaryError;
 for(const suffix of ['.tmp','.previous'])try{const bytes=fs.readFileSync(file+suffix),parsed=JSON.parse(bytes.toString('utf8'));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return {bytes,source:suffix,info:{source:suffix,message:'Recovered your last saved workspace after an interrupted write.'}};}catch{}
 throw primaryError;
}
function recoverCorrupt(file){
 for(const suffix of ['.tmp','.previous'])try{const bytes=fs.readFileSync(file+suffix),parsed=JSON.parse(bytes.toString('utf8'));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return {bytes,source:suffix,info:{source:suffix,message:'Recovered your last saved workspace from a local recovery copy.'}};}catch{}
 return null;
}
module.exports={durableWrite,readRecovery,recoverCorrupt};
