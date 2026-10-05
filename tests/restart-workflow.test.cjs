'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {RestartWorkflow}=require('../src/main/restart-workflow.cjs');
function fixture(overrides={}){const calls=[];const operations=Object.fromEntries(['validate','checkWork','lock','flush','prepare','commit','cancel','invalidateShutdown','quit'].map(name=>[name,async(...args)=>{calls.push(name);return name==='prepare'?{id:'staged'}:undefined;}]));operations.quit=()=>calls.push('quit');operations.shutdownReady=async()=>{calls.push('saved');return true;};return{calls,workflow:new RestartWorkflow({...operations,...overrides})};}
test('one restart owns staging and commits only after successful shutdown saving',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);const f=fixture({validate:()=>gate});const first=f.workflow.run({kind:'update'});await assert.rejects(f.workflow.run({kind:'install'}),/already/);release();await first;assert.ok(f.calls.indexOf('saved')<f.calls.indexOf('commit'));assert.equal(f.calls.filter(call=>call==='quit').length,1);
});
test('failed shutdown cancels the armed helper and unlocks without committing',async()=>{
  const f=fixture({shutdownReady:async()=>false});await assert.rejects(f.workflow.run({kind:'update'}),/could not be saved/);assert.ok(f.calls.includes('cancel'));assert.ok(f.calls.includes('invalidateShutdown'));assert.ok(!f.calls.includes('commit'));assert.ok(!f.calls.includes('quit'));assert.equal(f.workflow.active,false);
});
test('an invalid update never stages a replacement',async()=>{
  const f=fixture({validate:async()=>{throw Error('Download the update again');}});await assert.rejects(f.workflow.run({kind:'update'}),/Download/);assert.ok(!f.calls.includes('prepare'));assert.equal(f.workflow.active,false);
});
