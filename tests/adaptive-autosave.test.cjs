'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {AdaptivePoll}=require('../src/main/adaptive-poll.cjs');
function clock(){
  let now=0,id=0;const jobs=new Map();
  return {now:()=>now,setTimeout:(run,delay)=>{const key=++id;jobs.set(key,{run,at:now+delay});return key;},
    clearTimeout:key=>jobs.delete(key),async advance(ms){const target=now+ms;for(;;){const due=[...jobs].filter(([,job])=>job.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;jobs.delete(due[0]);now=due[1].at;await due[1].run();await Promise.resolve();}now=target;}};
}
test('hidden idle checks fall to four per minute while active work keeps its fast cadence',async()=>{
  const time=clock();let idle=0;const poll=new AdaptivePoll(()=>{idle++;},{now:time.now,schedule:time.setTimeout,cancel:time.clearTimeout});
  poll.context({visible:false});await time.advance(60000);assert.equal(idle,4);
  poll.context({working:true});const start=idle;await time.advance(60000);assert.ok(idle-start>=60);poll.dispose();const final=idle;await time.advance(60000);assert.equal(idle,final);
});
test('pointer movement cannot turn activity checks into a polling storm',async()=>{
  const time=clock();let calls=0;const poll=new AdaptivePoll(()=>{calls++;},{now:time.now,schedule:time.setTimeout,cancel:time.clearTimeout});
  for(let i=0;i<600;i++){poll.wake();await time.advance(16);}assert.ok(calls<25);poll.dispose();
});
test('continuous typing saves before a pause and flushes the final buffer',async()=>{
  const time=clock(),window={};vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/autosave.js'),'utf8'),{window,setTimeout:time.setTimeout,clearTimeout:time.clearTimeout,Promise});
  let text='';const saved=[];const autosave=new window.OgleAutosave(()=>saved.push({text,at:time.now()}));
  for(let i=0;i<25;i++){text+='x';autosave.schedule();await time.advance(100);}
  assert.ok(saved.length>0,'Typing must not indefinitely defer recovery');assert.ok(saved[0].at<=1500);await autosave.flush();assert.equal(saved.at(-1).text,text);
  const count=saved.length;await time.advance(5000);assert.equal(saved.length,count);
});
