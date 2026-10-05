'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {CodexHistoryPages}=require('../src/main/codex-history-pages.cjs');
const {CodexRolloutPages}=require('../src/main/codex-rollout-pages.cjs');
function fixture(count=10000){const calls=[],all=Array.from({length:count},(_,id)=>({turnId:'turn-'+Math.floor(id/2),item:{id:String(id),type:id%2?'agentMessage':'userMessage',text:'x'.repeat(600)}})).reverse();const rpc=async(method,params)=>{calls.push({method,params});if(method==='thread/read')return {thread:{id:params.threadId,status:{type:'idle'}}};if(method==='thread/turns/list')return {data:[{id:'turn-4999',status:'completed'}]};const start=Number(params.cursor||0),data=all.slice(start,start+params.limit);return {data,nextCursor:start+data.length<all.length?String(start+data.length):null};};return {pages:new CodexHistoryPages({rpc,projectItem:item=>item}),calls,all};}
test('initial and earlier pages are bounded, chronological and do not reread the whole history',async()=>{
 const f=fixture(),a=await f.pages.read('one'),b=await f.pages.read('one',{cursor:a.thread.history.nextCursor});
 assert.equal(a.thread.turns.flatMap(t=>t.items).length,80);assert.equal(a.thread.turns[0].items[0].id,'9920');assert.equal(b.thread.turns[0].items[0].id,'9840');
 assert.equal(f.calls.filter(call=>call.method==='thread/items/list').length,2);assert.ok(f.calls.filter(call=>call.method==='thread/read').every(call=>call.params.includeTurns===false));
 await assert.rejects(f.pages.read('two',{cursor:a.thread.history.nextCursor}),/cursor expired/);
});
test('tool-only pages stop after a bounded amount of work and allow continuing',async()=>{
 let requests=0;const pages=new CodexHistoryPages({maximumPages:2,rpc:async method=>method==='thread/items/list'?(requests++,{data:[{item:{type:'tool'}}],nextCursor:String(requests)}):method==='thread/read'?{thread:{id:'one'}}:{data:[]},projectItem:item=>item?.type==='tool'?null:item});
 const a=await pages.read('one');assert.equal(requests,2);assert.equal(a.thread.history.loadedMessages,0);assert.equal(a.thread.history.hasMore,true);
});
test('legacy rollout suffix pages stay bounded and old cursors ignore appended messages',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'ogle-history-')),file=path.join(folder,'rollout.jsonl');
 try{const rows=Array.from({length:10000},(_,i)=>JSON.stringify({type:'response_item',payload:{id:String(i),type:'message',role:i%2?'assistant':'user',content:[{text:'x'.repeat(600)}]}})+'\n');await fs.writeFile(file,rows.join(''));const pages=new CodexRolloutPages();const thread={id:'one',path:file,status:{type:'idle'}},a=await pages.read(thread);await fs.appendFile(file,rows.at(-1));const b=await pages.read(thread,{cursor:a.thread.history.nextCursor});assert.equal(a.thread.turns[0].items[0].id,'9920');assert.equal(b.thread.turns[0].items[0].id,'9840');assert.ok(a.thread.history.bytesRead<150000);console.log(JSON.stringify({fullBytes:(await fs.stat(file)).size,boundedBytes:a.thread.history.bytesRead,visibleMessages:80}));}
 finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('bridge incremental history retains live desktop ownership once and lightweight runtime never hydrates turns',async()=>{
 const {CodexBridge}=require('../src/main/codex-bridge.cjs'),{EventEmitter}=require('node:events');
 const desktop=new EventEmitter();desktop.states=new Map();desktop.owner=async()=> 'owner';let follows=0;desktop.read=async()=>{follows++;desktop.states.set('one',{state:{id:'one',threadRuntimeStatus:{type:'active'},latestThreadSettings:{model:'desktop-model',effort:'high'},turns:[{id:'turn',status:'inProgress'}]}});return {thread:{turns:[]},runtime:{source:'desktop',running:true,turnId:'turn'}};};
 const bridge=new CodexBridge({desktop,spawnProcess:()=>{}});bridge.connect=async()=>{};const f=fixture();bridge._rpc=async(method,params)=>{f.calls.push({method,params});if(method==='thread/read')return {thread:{id:'one',status:{type:'active'}}};if(method==='thread/turns/list')return {data:[{id:'turn',status:'inProgress'}]};const start=Number(params.cursor||0);return {data:f.all.slice(start,start+params.limit),nextCursor:String(start+params.limit)};};
 const a=await bridge.readThread('one',{incremental:true});await bridge.readThread('one',{incremental:true,historyCursor:a.thread.history.nextCursor});assert.equal(follows,1);assert.equal(a.thread.model,'desktop-model');assert.equal(a.runtime.running,true);
 const runtime=await bridge.readRuntime('one');assert.equal(runtime.runtime.turnId,'turn');assert.ok(f.calls.filter(x=>x.method==='thread/read').every(x=>x.params.includeTurns===false));
 let emitted;bridge.once('notification',event=>emitted=event);desktop.emit('state',{thread:{id:'one',turns:[]}});assert.equal(emitted.params.partial,true);
});
