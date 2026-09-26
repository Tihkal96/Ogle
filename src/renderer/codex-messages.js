'use strict';
// Keep streaming text out of the DOM until the conversation is visible. Commit
// changed messages in batches, with one scroll measurement per batch.
window.OgleMessages = class {
  constructor(container,elements,visible){this.container=container;this.elements=elements;this.visible=visible;this.items=new Map();this.pending=new Set();this.timer=null;}
  text(id){return this.items.get(id)?.text || '';}
  set(id,role,text){
    if(!id || !['user','assistant'].includes(role))return;
    const old=this.items.get(id);if(old?.text===text && old.role===role)return;
    this.items.set(id,{role,text});this.pending.add(id);this.schedule();
  }
  reset(){clearTimeout(this.timer);this.timer=null;this.items.clear();this.pending.clear();this.elements.clear();this.container.replaceChildren();}
  reconcile(ids){for(const id of this.items.keys())if(!ids.has(id)){this.items.delete(id);this.pending.delete(id);this.elements.get(id)?.remove();this.elements.delete(id);}}
  schedule(){if(this.timer || !this.pending.size || !this.visible())return;this.timer=setTimeout(()=>{this.timer=null;this.flush();},100);}
  flush(){
    if(!this.visible())return;
    const node=this.container,follow=node.scrollHeight-node.scrollTop-node.clientHeight<70;
    const fragment=document.createDocumentFragment(),start=performance.now();let count=0;
    for(const id of this.pending){
      const item=this.items.get(id);this.pending.delete(id);if(!item)continue;
      let element=this.elements.get(id);
      if(!element){element=document.createElement('article');element.className=`message ${item.role}`;const label=document.createElement('div');label.className='message-label';label.textContent=item.role==='user'?'YOU':'CODEX';const body=document.createElement('div');body.className='message-text';element.append(label,body);fragment.append(element);this.elements.set(id,element);}
      element.lastChild.textContent=item.text;
      if(++count>=40 || performance.now()-start>8)break;
    }
    node.querySelector('.empty')?.remove();node.append(fragment);
    if(follow)node.scrollTop=node.scrollHeight;
    this.schedule();
  }
};
