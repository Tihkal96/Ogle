'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const scope={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/idle-animation.js'),'utf8'),scope);
const animations={idle:[0,6,190],waving:[3,4,170],review:[8,6,190],running:[7,6,140]};
test('idle waits a minute, plays exactly one cycle, then waits a fresh minute',()=>{
 const idle=new scope.window.OgleIdleAnimation(()=>0);
 assert.equal(idle.tick(0,true,animations),null);assert.equal(idle.tick(59999,true,animations),null);
 assert.equal(idle.tick(60000,true,animations).name,'waving');
 assert.equal(idle.tick(60679,true,animations).name,'waving');assert.equal(idle.tick(60680,true,animations),null);
 assert.equal(idle.tick(120679,true,animations),null);assert.equal(idle.tick(120680,true,animations).name,'waving');
});
test('real activity cancels a flourish and restarts the uninterrupted idle wait',()=>{
 const idle=new scope.window.OgleIdleAnimation(()=>0.99);
 idle.tick(0,true,animations);assert.equal(idle.tick(60000,true,animations).name,'review');
 assert.equal(idle.tick(60100,false,animations),null);idle.tick(90000,false,animations);
 assert.equal(idle.tick(90000,true,animations),null);
 assert.equal(idle.tick(149999,true,animations),null);assert.equal(idle.tick(150000,true,animations).name,'review');
});
test('working plays one cycle each minute and returns to the real work animation between cycles',()=>{
 const animation=new scope.window.OgleIdleAnimation(()=>0.99);
 assert.equal(animation.tick(0,'running',animations),null);
 assert.equal(animation.tick(59999,'running',animations),null);
 const flourish=animation.tick(60000,'running',animations);
 assert.equal(flourish.name,'review');assert.equal(flourish.until,61140);
 assert.equal(animation.tick(61139,'running',animations),flourish);
 assert.equal(animation.tick(61140,'running',animations),null);
 assert.equal(animation.tick(121139,'running',animations),null);
 assert.equal(animation.tick(121140,'running',animations).name,'review');
});
test('changing idle/work mode cancels the flourish and starts a fresh minute',()=>{
 const animation=new scope.window.OgleIdleAnimation(()=>0);
 animation.tick(0,'idle',animations);assert.ok(animation.tick(60000,'idle',animations));
 assert.equal(animation.tick(60100,'running',animations),null);
 assert.equal(animation.tick(120099,'running',animations),null);
 assert.ok(animation.tick(120100,'running',animations));
 assert.equal(animation.tick(120200,'idle',animations),null);
 assert.equal(animation.tick(180199,'idle',animations),null);
 assert.ok(animation.tick(180200,'idle',animations));
});
test('attention and hover states cancel work flourishes and never schedule their own',()=>{
 for(const state of ['waiting','failed','waving','review',false]){
  const animation=new scope.window.OgleIdleAnimation(()=>0);
  animation.tick(0,'running',animations);assert.ok(animation.tick(60000,'running',animations));
  assert.equal(animation.tick(60100,state,animations),null);
  assert.equal(animation.tick(200000,state,animations),null);
  assert.equal(animation.tick(200001,'running',animations),null);
  assert.equal(animation.tick(260000,'running',animations),null);
  assert.ok(animation.tick(260001,'running',animations));
 }
});
