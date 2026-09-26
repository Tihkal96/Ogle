'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('all main and renderer entry modules parse before an app can launch',()=>{
 for(const folder of ['main','renderer'])for(const entry of fs.readdirSync(path.join(__dirname,'../src',folder))){
  if(!/\.(?:c?js)$/.test(entry))continue;
  const file=path.join(__dirname,'../src',folder,entry),result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,`${entry}: ${result.stderr}`);
 }
});
