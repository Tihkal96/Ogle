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
 assert.equal(idle.tick(149999,true,animations),null);assert.equal(idle.tick(150000,true,animations).name,'review');
});
