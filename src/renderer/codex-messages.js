'use strict';
// Keep streaming text out of the DOM until the conversation is visible. Commit
// changed messages in batches, with one scroll measurement per batch.
window.OgleMessages = class {
  constructor(container,elements,visible){
    this.container=container;this.elements=elements;this.visible=visible;this.items=new Map();this.pending=new Set();this.timer=null;
    this.positions=new Map();this.conversation=null;this.restore=null;this.appliedTop=null;
    container.addEventListener('scroll',()=>{
      if(!this.visible())return;
      // Browser scroll events also follow our own batched restoration writes.
      if(this.restore || (this.appliedTop!==null && Math.abs(container.scrollTop-this.appliedTop)<2))return;
      this.restore=null;this.remember();
    });
    const userScroll=()=>{this.restore=null;this.appliedTop=null;};
    container.addEventListener('wheel',userScroll,{passive:true});
    container.addEventListener('pointerdown',userScroll);
    container.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))userScroll();});
  }
  remember(){
    if(!this.conversation || !this.visible())return;
    const node=this.container;
    this.positions.set(this.conversation,this.restore?{...this.restore}:{top:node.scrollTop,bottom:node.scrollHeight-node.scrollTop-node.clientHeight<70});
  }
  select(id){
    this.remember();this.reset();this.conversation=id;
    this.restore={...(this.positions.get(id)||{top:0,bottom:true})};
    this.appliedTop=this.container.scrollTop;
  }
  toBottom(){this.restore={top:0,bottom:true};this.applyPosition();this.remember();this.settlePosition();}
  applyPosition(){
    if(!this.restore)return;
    const node=this.container;node.scrollTop=this.restore.bottom?node.scrollHeight:this.restore.top;
    this.appliedTop=node.scrollTop;
  }
  settlePosition(){
    if(!this.restore || this.pending.size)return;
    if(typeof requestAnimationFrame!=='function'){this.remember();this.restore=null;return;}
    const target=this.restore;let previous=-1,stable=0,frames=0;
    const settle=()=>{
      if(this.restore!==target || !this.visible() || this.pending.size)return;
      this.applyPosition();const height=this.container.scrollHeight;
      stable=height===previous?stable+1:0;previous=height;
      // content-visibility resolves estimated heights as the bottom comes into view.
      if(++frames<12 && stable<3)requestAnimationFrame(settle);
      else {this.remember();this.restore=null;}
    };
    requestAnimationFrame(settle);
  }
  text(id){return this.items.get(id)?.text || '';}
  set(id,role,text){
    if(!id || !['user','assistant'].includes(role))return;
    const old=this.items.get(id);if(old?.text===text && old.role===role)return;
    this.items.set(id,{role,text});this.pending.add(id);this.schedule();
  }
  reset(){clearTimeout(this.timer);this.timer=null;this.items.clear();this.pending.clear();this.elements.clear();this.restore=null;this.appliedTop=null;this.container.replaceChildren();}
  reconcile(ids){for(const id of this.items.keys())if(!ids.has(id)){this.items.delete(id);this.pending.delete(id);this.elements.get(id)?.remove();this.elements.delete(id);}}
  schedule(){if(!this.visible())return;if(!this.pending.size){this.settlePosition();return;}if(this.timer)return;this.timer=setTimeout(()=>{this.timer=null;this.flush();},100);}
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
    if(this.restore)this.applyPosition();
    else if(follow){node.scrollTop=node.scrollHeight;this.appliedTop=node.scrollTop;}
    if(!this.pending.size)this.remember();
    this.schedule();
  }
};
