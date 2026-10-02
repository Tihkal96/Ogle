const test=require('node:test');
const assert=require('node:assert/strict');
const Queue=require('../src/renderer/codex-queue.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(send=async()=>{}){const calls=[];const queue=new Queue({send:async entry=>{calls.push(entry);return send(entry);}});queue.setConnected(true);return{queue,calls};}
test('busy queue captures images, preserves order and releases one turn per completion',async()=>{
  const {queue,calls}=fixture();queue.runtime('a',{running:true});
  const images=[{url:'data:image/png;base64,one'}];queue.enqueue({threadId:'a',text:'first',images});images[0].url='changed';queue.enqueue({threadId:'a',text:'second'});
  assert.equal(calls.length,0);queue.runtime('a',{running:false});await tick();
  assert.equal(calls.length,1);assert.equal(calls[0].images[0].url,'data:image/png;base64,one');
  queue.runtime('a',{running:false});await tick();assert.equal(calls.length,1);
  queue.runtime('a',{running:true});queue.runtime('a',{running:false});await tick();assert.equal(calls.length,2);
});
test('unknown state and approvals block sends; reconnect requires fresh runtime',async()=>{
  const {queue,calls}=fixture();queue.enqueue({threadId:'a',text:'one'});assert.equal(calls.length,0);
  queue.runtime('a',{running:false,waitingForApproval:true});assert.equal(calls.length,0);
  queue.setConnected(false);queue.setConnected(true);assert.equal(calls.length,0);
  queue.runtime('a',{running:false});await tick();assert.equal(calls.length,1);
});
test('failure pauses captured prompt and following messages until explicit retry or removal',async()=>{
  let fail=true;const {queue,calls}=fixture(async()=>{if(fail)throw new Error('Transport failed');});
  queue.runtime('a',{running:true});const first=queue.enqueue({threadId:'a',text:'one'});queue.enqueue({threadId:'a',text:'two'});
  queue.runtime('a',{running:false});await tick();assert.equal(first.status,'paused');assert.equal(queue.list('a').length,2);
  queue.runtime('a',{running:false},{completed:true});await tick();assert.equal(calls.length,1);
  fail=false;queue.retry(first.id);await tick();assert.equal(calls.length,2);assert.equal(queue.list('a').length,1);
  queue.runtime('a',{running:false},{completed:true});await tick();assert.equal(calls.length,3);
});
test('completion before send response resolves does not duplicate or strand next message',async()=>{
  let release;const {queue,calls}=fixture(()=>new Promise(resolve=>{release=resolve;}));
  queue.runtime('a',{running:false});queue.enqueue({threadId:'a',text:'one'});queue.enqueue({threadId:'a',text:'two'});
  queue.runtime('a',{running:false},{completed:true});assert.equal(calls.length,1);release();await tick();assert.equal(calls.length,2);release();await tick();
});
test('remove cancels queued prompt and separate tasks retain their own queues',async()=>{
  const {queue,calls}=fixture();queue.runtime('a',{running:true});queue.runtime('b',{running:false});
  const entry=queue.enqueue({threadId:'a',text:'cancel me'});queue.enqueue({threadId:'b',text:'send me'});assert.equal(queue.cancel(entry.id),true);await tick();
  queue.runtime('a',{running:false});assert.deepEqual(calls.map(entry=>entry.threadId),['b']);assert.equal(queue.list().length,0);
});
test('a fast desktop turn completed before send response releases by matching turn ID only',async()=>{
  let release;const {queue,calls}=fixture(()=>new Promise(resolve=>{release=resolve;}));
  queue.runtime('a',{running:false},{completedTurnId:'old'});queue.enqueue({threadId:'a',text:'one'});queue.enqueue({threadId:'a',text:'two'});
  queue.runtime('a',{running:false},{completedTurnId:'new'});release({turn:{id:'new'}});await tick();assert.equal(calls.length,2);
  release({turn:{id:'next'}});await tick();queue.enqueue({threadId:'a',text:'three'});
  queue.runtime('a',{running:false},{completedTurnId:'new'});assert.equal(calls.length,2);
  queue.runtime('a',{running:false},{completedTurnId:'next'});assert.equal(calls.length,3);release({turn:{id:'third'}});await tick();
});
test('stale completion after the next started event cannot release another queued prompt',async()=>{
  let sequence=0;const {queue,calls}=fixture(async()=>({turn:{id:`turn-${++sequence}`}}));
  queue.runtime('a',{running:false});queue.enqueue({threadId:'a',text:'first'});queue.enqueue({threadId:'a',text:'second'});queue.enqueue({threadId:'a',text:'third'});await tick();
  queue.runtime('a',{running:true,turnId:'turn-1'});queue.runtime('a',{running:false},{completedTurnId:'turn-1'});await tick();
  queue.runtime('a',{running:true,turnId:'turn-2'});queue.runtime('a',{running:false},{completedTurnId:'turn-1'});await tick();assert.equal(calls.length,2);
  queue.runtime('a',{running:false},{completedTurnId:'turn-2'});await tick();assert.equal(calls.length,3);
});

test('queued prompts snapshot chosen model and effort independently of later picker changes',async()=>{
 const {queue,calls}=fixture();queue.runtime('a',{running:true});const options={model:'first-model',effort:'high'};
 queue.enqueue({threadId:'a',text:'first',options});options.model='second-model';options.effort='low';queue.enqueue({threadId:'a',text:'second',options});options.model='third-model';
 queue.runtime('a',{running:false});await tick();assert.deepEqual(calls[0].options,{model:'first-model',effort:'high'});
 queue.runtime('a',{running:true});queue.runtime('a',{running:false});await tick();assert.deepEqual(calls[1].options,{model:'second-model',effort:'low'});
});
