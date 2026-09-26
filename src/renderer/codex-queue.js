'use strict';
// Runtime events, rather than timers or optimistic UI state, release queued turns.
class OgleCodexQueue {
  constructor({send,onChange=()=>{},onError=()=>{}}) {
    this.send=send;this.onChange=onChange;this.onError=onError;
    this.entries=[];this.threads=new Map();this.connected=false;this.sequence=0;this.rendered=new WeakMap();
  }
  thread(id) {
    if(!this.threads.has(id))this.threads.set(id,{known:false,busy:false,blocked:false,inFlight:false,awaiting:false,sawBusy:false});
    return this.threads.get(id);
  }
  setConnected(value) {
    this.connected=Boolean(value);
    // Reconnection must provide fresh runtime evidence before another send.
    if(!value)for(const thread of this.threads.values())thread.known=false;
    this.changed();
    if(value)for(const id of this.threads.keys())this.pump(id);
  }
  runtime(id,runtime,{completed=false,completedTurnId}={}) {
    if(!id)return;
    const thread=this.thread(id);
    thread.known=true;thread.busy=Boolean(runtime.running);
    thread.blocked=Boolean(runtime.waitingForApproval||runtime.waitingForInput);
    if(completedTurnId)thread.completedTurnId=completedTurnId;
    if(thread.busy)thread.sawBusy=true;
    const finished=completedTurnId
      ? !thread.awaiting||completedTurnId===thread.awaitingTurnId
      : completed||thread.sawBusy;
    if(!thread.busy && finished) {
      thread.awaiting=false;thread.sawBusy=false;
    }
    this.pump(id);
  }
  enqueue({threadId,title='',text='',images=[]}) {
    if(!threadId||(!text.trim()&&!images.length))throw new Error('Choose a task and enter a prompt first.');
    if(this.list(threadId).length>=20||this.entries.length>=60)throw new Error('The message queue is full. Send or remove a queued prompt first.');
    const entry={id:`queued-${++this.sequence}`,threadId,title,text,images:structuredClone(images),status:'queued'};
    this.entries.push(entry);this.changed();this.pump(threadId);return entry;
  }
  list(threadId) {return this.entries.filter(entry=>!threadId||entry.threadId===threadId);}
  cancel(id) {
    const entry=this.entries.find(item=>item.id===id);
    if(!entry||entry.status==='sending')return false;
    this.entries=this.entries.filter(item=>item!==entry);this.changed();this.pump(entry.threadId);return true;
  }
  retry(id) {
    const entry=this.entries.find(item=>item.id===id);
    if(!entry||entry.status!=='paused')return;
    entry.status='queued';delete entry.error;this.changed();this.pump(entry.threadId);
  }
  changed(){this.onChange(this.entries);}
  async pump(id) {
    const thread=this.thread(id),entry=this.entries.find(item=>item.threadId===id);
    if(!this.connected||!thread.known||thread.busy||thread.blocked||thread.inFlight||thread.awaiting||!entry||entry.status!=='queued')return;
    thread.inFlight=true;thread.awaiting=true;thread.sawBusy=false;
    thread.awaitingTurnId=null;
    entry.status='sending';this.changed();
    try {
      const result=await this.send(entry);
      thread.awaitingTurnId=result?.turn?.id||result?.id;
      if(thread.awaitingTurnId&&thread.completedTurnId===thread.awaitingTurnId&&!thread.busy)thread.awaiting=false;
      this.entries=this.entries.filter(item=>item!==entry);
    } catch(error) {
      // A transport error can be ambiguous. Never automatically repeat a send.
      entry.status='paused';entry.error=String(error?.message||error);
      thread.awaiting=false;this.onError(error,entry);
    } finally {
      thread.inFlight=false;this.changed();this.pump(id);
    }
  }
  render(container,threadId) {
    const entries=this.list(threadId),signature=JSON.stringify([threadId,entries.map(entry=>[entry.id,entry.status])]);
    if(this.rendered.get(container)===signature)return;
    this.rendered.set(container,signature);container.replaceChildren();container.hidden=!entries.length;
    for(const entry of entries) {
      const row=document.createElement('div');row.className='queued-prompt';
      const label=document.createElement('span');
      label.textContent=`${entry.status==='paused'?'Send paused — review before retry':entry.status==='sending'?'Sending':'Queued'}: ${entry.text||'Attached images'}`;
      label.title=entry.text;row.append(label);
      if(entry.images.length){const count=document.createElement('small');count.textContent=`${entry.images.length} image${entry.images.length===1?'':'s'}`;row.append(count);}
      if(entry.status==='paused') {
        const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';
        retry.title='Check the conversation before retrying to avoid sending twice';retry.onclick=()=>this.retry(entry.id);row.append(retry);
      }
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Remove';cancel.disabled=entry.status==='sending';cancel.onclick=()=>this.cancel(entry.id);row.append(cancel);container.append(row);
    }
  }
}
if(typeof module!=='undefined'&&module.exports)module.exports=OgleCodexQueue;
else window.OgleCodexQueue=OgleCodexQueue;
