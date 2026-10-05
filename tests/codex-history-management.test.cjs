'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CodexBridge}=require('../src/main/codex-bridge.cjs');
function fixture({owner=null,running=false,status='idle'}={}) {
 const sent=[];let closed=0;
 const bridge=new CodexBridge({runtimeClientFactory:()=>({owner:async()=>owner,readRuntime:async()=>running===null?null:{running},close(){closed++}})});
 bridge.connect=async()=>{};
 bridge._rpc=async(method,params)=>{sent.push({method,params});return method==='thread/read'?{thread:{status:{type:status}}}:{}};
 return {bridge,sent,closed:()=>closed};
}
test('rename uses official name RPC without changing conversation execution',async()=>{
 const f=fixture({owner:'desktop',running:true});await f.bridge.renameThread('thread',' New title ');
 assert.deepEqual(f.sent,[{method:'thread/name/set',params:{threadId:'thread',name:'New title'}}]);
 await assert.rejects(f.bridge.renameThread('thread',' '),/conversation name/);
});
test('archive checks fresh desktop runtime and refuses an active conversation',async()=>{
 const f=fixture({owner:'desktop',running:true});await assert.rejects(f.bridge.archiveThread('thread'),/Stop the active/);assert.deepEqual(f.sent,[]);assert.equal(f.closed(),1);
});
test('archive and restore use recoverable official history operations',async()=>{
 const f=fixture();await f.bridge.archiveThread('thread');await f.bridge.unarchiveThread('thread');
 assert.deepEqual(f.sent,[{method:'thread/read',params:{threadId:'thread',includeTurns:false}},{method:'thread/archive',params:{threadId:'thread'}},{method:'thread/unarchive',params:{threadId:'thread'}}]);assert.equal(f.closed(),1);
});
test('unknown desktop or server runtime prevents archiving',async()=>{
 const f=fixture({owner:'desktop',running:null});await assert.rejects(f.bridge.archiveThread('thread'),/Cannot check/);assert.equal(f.sent.length,0);
 const g=fixture({status:'unknown'});await assert.rejects(g.bridge.archiveThread('thread'),/Cannot check/);assert.equal(g.sent.length,1);
});
