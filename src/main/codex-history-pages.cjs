'use strict';
const {randomUUID}=require('node:crypto');
class CodexHistoryPages {
  constructor({rpc,projectItem,maximumPages=8,pageSize=100}){Object.assign(this,{rpc,projectItem,maximumPages,pageSize});this.cursors=new Map();}
  clear(){this.cursors.clear();}
  async read(id,{limit=80,cursor}={}){
    if(cursor && (!this.cursors.has(cursor)||this.cursors.get(cursor).id!==id))throw new Error('Conversation history cursor expired. Reopen the conversation.');
    const saved=cursor?this.cursors.get(cursor):null;
    // Read metadata only: never hydrate the whole transcript or resume its writer.
    const metadata=await this.rpc('thread/read',{threadId:id,includeTurns:false});
    let pending=saved?[...saved.pending]:[],serverCursor=saved?.serverCursor,exhausted=saved?.exhausted||false;
    const entries=[],seen=new Set();let requests=0;
    while(entries.length<limit){
      if(!pending.length){
        if(exhausted||requests>=this.maximumPages)break;
        const page=await this.rpc('thread/items/list',{threadId:id,limit:this.pageSize,sortDirection:'desc',...(serverCursor?{cursor:serverCursor}:{})});requests++;
        if(!Array.isArray(page?.data))throw new Error('Codex returned invalid conversation history.');
        if(page.nextCursor && page.nextCursor===serverCursor)throw new Error('Codex repeated a conversation history cursor.');
        pending=page.data.filter(entry=>this.projectItem(entry?.item));serverCursor=page.nextCursor||null;exhausted=!serverCursor;
        if(!pending.length&&exhausted)break;
      }
      const entry=pending.shift(),item=this.projectItem(entry?.item);if(!item||seen.has(item.id))continue;seen.add(item.id);entries.push({turnId:entry.turnId,item});
    }
    const turns=[];for(const entry of entries.reverse()){let turn=turns.at(-1);if(turn?.id!==entry.turnId){turn={id:entry.turnId,status:'completed',items:[]};turns.push(turn);}turn.items.push(entry.item);}
    // Item entries do not expose turn completion; fetch one tiny turn summary.
    const latest=await this.rpc('thread/turns/list',{threadId:id,limit:1,sortDirection:'desc',itemsView:'notLoaded'});
    const last=latest?.data?.[0];if(last){const turn=turns.find(turn=>turn.id===last.id);if(turn){turn.status=last.status;turn.error=last.error;}}
    let nextCursor=null;if(pending.length||!exhausted){nextCursor=randomUUID();this.cursors.set(nextCursor,{id,pending,serverCursor,exhausted});while(this.cursors.size>64)this.cursors.delete(this.cursors.keys().next().value);}
    const status=metadata.thread?.status?.type,running=status==='active';
    return {...metadata,thread:{...metadata.thread,turns,history:{hasMore:!!nextCursor,nextCursor,loadedMessages:entries.length,incremental:true}},runtime:{source:'app-server',running,...(running&&last?.id?{turnId:last.id}:{})}};
  }
}
module.exports={CodexHistoryPages};
