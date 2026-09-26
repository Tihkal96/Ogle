'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {configureStartup,ensureCodex}=require('../src/main/startup.cjs');
test('login entry enables and removes the same executable and arguments',()=>{
  const calls=[],app={isPackaged:true,setLoginItemSettings:value=>calls.push(value)};
  configureStartup(app,true,{isolated:false,executable:'C:\\PetDock\\PetDock.exe'});
  configureStartup(app,false,{isolated:false,executable:'C:\\PetDock\\PetDock.exe'});
  assert.deepEqual(calls,[{openAtLogin:true,path:'C:\\PetDock\\PetDock.exe',args:['--autostart']},{openAtLogin:false,path:'C:\\PetDock\\PetDock.exe',args:['--autostart']}]);
});
test('isolated profiles never register real login items',()=>{
  configureStartup({isPackaged:true,setLoginItemSettings:()=>assert.fail('test changed startup')},true,{isolated:true});
});
test('ready Codex is never opened a second time',async()=>{
  const result=await ensureCodex({ready:async()=>true,running:async()=>assert.fail(),open:async()=>assert.fail(),wait:async()=>assert.fail()});
  assert.equal(result.opened,false);
});
test('Codex own startup gets a grace period and process check',async()=>{
  let checks=0,waits=0;
  const result=await ensureCodex({ready:async()=>{checks++;return false;},running:async()=>true,open:async()=>assert.fail(),wait:async()=>waits++});
  assert.equal(checks,6);assert.equal(waits,5);assert.equal(result.reason,'already-starting');
});
test('missing Codex is opened once after startup grace period',async()=>{
  const opened=[];const result=await ensureCodex({ready:async()=>false,running:async()=>false,open:async url=>opened.push(url),wait:async()=>{}});
  assert.equal(result.opened,true);assert.deepEqual(opened,['codex://']);
});
