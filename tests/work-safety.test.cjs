'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{websiteHasDraft,freshActivity}=require('../src/main/work-safety.cjs');
const panel=value=>({view:{webContents:{isDestroyed:()=>false,isLoadingMainFrame:()=>false,executeJavaScript:async()=>value}}});
test('website draft guard returns only boolean results and rejects failed or loading pages',async()=>{
 assert.equal(await websiteHasDraft(panel(true)),true);assert.equal(await websiteHasDraft(panel(false)),false);assert.equal(await websiteHasDraft(null),false);
 const loading=panel(false);loading.view.webContents.isLoadingMainFrame=()=>true;await assert.rejects(websiteHasDraft(loading),/finish loading/);
 const failure=panel(false);failure.view.webContents.executeJavaScript=async()=>{throw Error('page gone')};await assert.rejects(websiteHasDraft(failure),/could not be checked/);
});
test('fresh activity waits for in-flight collection before starting one authoritative probe',async()=>{
 const events=[],activity={pending:true,poll:async()=>{events.push('fresh');assert.equal(activity.pending,false);return true;}};const request=freshActivity({activity});await new Promise(resolve=>setTimeout(resolve,30));assert.deepEqual(events,[]);activity.pending=false;await request;assert.deepEqual(events,['fresh']);
});
test('a fresh activity probe failure blocks restart instead of using stale idle state',async()=>{
 await assert.rejects(freshActivity({activity:{pending:false,poll:async()=>{throw Error('probe failed')}}}),/probe failed/);
});

test('invalid draft probe values fail closed rather than treating uncertainty as empty',async()=>{
 for(const value of [null,undefined,0,'false',{}])await assert.rejects(websiteHasDraft(panel(value)),/could not be checked/);
});

test('work appearing during staging cancels the armed helper before commit',async()=>{
 const {RestartWorkflow}=require('../src/main/restart-workflow.cjs');let staged=false,committed=false,cancelled=false,unlocked=false;
 const workflow=new RestartWorkflow({validate:async()=>{},checkWork:async()=>{if(staged)throw Error('Reply started during staging');},lock:async value=>{if(!value)unlocked=true;},flush:async()=>{},prepare:async()=>{staged=true;return {id:'helper'};},shutdownReady:async()=>true,commit:async()=>{committed=true;},cancel:async handoff=>{assert.equal(handoff.id,'helper');cancelled=true;},invalidateShutdown:()=>{},quit:()=>assert.fail('must stay open')});
 await assert.rejects(workflow.run({kind:'update'}),/Reply started/);assert.equal(cancelled,true);assert.equal(committed,false);assert.equal(unlocked,true);assert.equal(workflow.active,false);
});


test('an unavailable fresh activity sample cannot reuse an old idle state',async()=>{
 for(const value of [false,undefined,null])await assert.rejects(freshActivity({activity:{pending:false,poll:async()=>value}}),/activity could not be checked/);
});
