'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
// Legacy app-server capabilities expose an authoritative rollout path. Read only
// a bounded suffix; never search user folders or reconstruct tools/reasoning.
class CodexRolloutPages {
 constructor({maximumBytes=8*1024*1024,blockBytes=65536}={}){this.maximumBytes=maximumBytes;this.blockBytes=blockBytes;this.cursors=new Map();}
 clear(){this.cursors.clear();}
 async read(thread,{limit=80,cursor}={}){
  const file=thread.path;if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('Codex did not expose a readable conversation history path.');
  const previous=cursor?this.cursors.get(cursor):null;if(cursor&&(!previous||previous.id!==thread.id||previous.file!==file))throw new Error('Conversation history cursor expired. Reopen the conversation.');
  const handle=await fs.open(file,'r');
  try{
   const stat=await handle.stat();if(!stat.isFile()||previous&&(previous.ino!==stat.ino||previous.dev!==stat.dev||stat.size<previous.snapshotSize))throw new Error('Conversation history changed on disk. Reopen the conversation.');
   let position=previous?.offset??stat.size,carry=Buffer.alloc(0),carryEnd=position,bytes=0;const messages=[];
   while(position>0&&messages.length<limit&&bytes<this.maximumBytes){
    const length=Math.min(this.blockBytes,position),start=position-length,buffer=Buffer.allocUnsafe(length);await handle.read(buffer,0,length,start);bytes+=length;
    const combined=Buffer.concat([buffer,carry]);let end=combined.length;
    for(let index=combined.length-1;index>=0;index--){
     if(combined[index]!==10)continue;
     const line=combined.subarray(index+1,end);const lineOffset=start+index+1;end=index;
     if(line.length){let row;try{row=JSON.parse(line.toString('utf8'));}catch{continue;}
      const item=row.type==='response_item'?row.payload:null;if(item?.type==='message'&&['user','assistant'].includes(item.role)){
       const text=(item.content||[]).map(part=>part.text||(String(part.type).includes('image')?'[Image]':'')).filter(Boolean).join('\n');
       messages.push({id:item.id||'rollout:'+lineOffset,type:item.role==='user'?'userMessage':'agentMessage',text});
       if(messages.length>=limit){position=lineOffset;carry=Buffer.alloc(0);break;}
      }
     }
    }
    if(messages.length>=limit)break;
    carry=combined.subarray(0,end);position=start;carryEnd=start+carry.length;
    if(carry.length>2*1024*1024)throw new Error('A conversation history record is too large to display safely.');
   }
   // Cursor remains on an actual line boundary, so earlier pages never reread
   // messages. Appends after the first page do not move the historical anchor.
   let offset=messages.length>=limit?position:carryEnd;
   if(position===0)offset=0;
   let nextCursor=null;if(offset>0){nextCursor=randomUUID();this.cursors.set(nextCursor,{id:thread.id,file,offset,ino:stat.ino,dev:stat.dev,snapshotSize:previous?.snapshotSize??stat.size});while(this.cursors.size>64)this.cursors.delete(this.cursors.keys().next().value);}
   return {thread:{...thread,turns:messages.length?[{id:'rollout-history',status:'completed',items:messages.reverse()}]:[],history:{hasMore:!!nextCursor,nextCursor,loadedMessages:messages.length,incremental:true,source:'rollout',bytesRead:bytes}},runtime:{source:'app-server',running:thread.status?.type==='active'}};
  }finally{await handle.close();}
 }
}
module.exports={CodexRolloutPages};
