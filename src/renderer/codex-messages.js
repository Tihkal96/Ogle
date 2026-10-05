'use strict';
// Keep streaming text out of the DOM until the conversation is visible. Commit
// changed messages in batches, with one scroll measurement per batch.
window.OgleMessages = class {
  constructor(container,elements,visible,onBottomChange=()=>{}){
    this.container=container;this.elements=elements;this.visible=visible;this.items=new Map();this.pending=new Set();this.timer=null;
    this.positions=new Map();this.conversation=null;this.restore=null;this.appliedTop=null;this.followBottom=true;this.onBottomChange=onBottomChange;
    // Bottom intent survives hidden tabs and delayed text/layout reflow; only a
    // real scroll changes it. Observing articles catches content-visibility sizing.
    this.resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>this.layoutChanged()):null;
    this.resizeObserver?.observe(container);this.updateBottomButton();
    container.addEventListener('scroll',()=>{
      if(!this.visible())return;
      // Browser scroll events also follow our own batched restoration writes.
      if(this.restore || (this.appliedTop!==null && Math.abs(container.scrollTop-this.appliedTop)<2)){this.updateBottomButton();return;}
      this.appliedTop=null;this.followBottom=this.atBottom();this.remember();this.updateBottomButton();
    });
    const userScroll=event=>{if(event?.ctrlKey)return;this.restore=null;this.appliedTop=null;};
    container.addEventListener('wheel',userScroll,{passive:true});
    container.addEventListener('pointerdown',userScroll);
    container.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))userScroll();});
  }
  atBottom(){const node=this.container;return node.scrollHeight-node.scrollTop-node.clientHeight<4;}
  updateBottomButton(){this.onBottomChange(this.atBottom());}
  layoutChanged(){
    if(!this.visible())return;
    if(!this.restore && this.conversation)this.restore={...(this.positions.get(this.conversation)||{top:this.container.scrollTop,bottom:this.followBottom})};
    this.applyPosition();this.settlePosition();this.updateBottomButton();
  }
  remember(){
    if(!this.conversation || !this.visible())return;
    const node=this.container;
    this.positions.set(this.conversation,this.restore?{...this.restore}:{top:node.scrollTop,bottom:this.followBottom});
  }
  select(id){
    this.remember();this.reset();this.conversation=id;
    this.container.style.visibility='hidden';this.container.setAttribute('aria-busy','true');
    this.restore={...(this.positions.get(id)||{top:0,bottom:true})};
    this.followBottom=this.restore.bottom;this.appliedTop=this.container.scrollTop;this.updateBottomButton();
  }
  finishLoad(){this.container.style.visibility='';this.container.setAttribute('aria-busy','false');}
  prepend(items){
    const node=this.container,top=node.scrollTop,height=node.scrollHeight,added=[];
    for(const item of items)if(!this.items.has(item.id)){const article=document.createElement('article');article.className=`message ${item.role}`;const label=document.createElement('div');label.className='message-label';label.textContent=item.role==='user'?'YOU':'CODEX';const body=document.createElement('div');body.className='message-text';body.textContent=item.text;article.append(label,body);this.items.set(item.id,{role:item.role,text:item.text});this.elements.set(item.id,article);this.resizeObserver?.observe(article);added.push(article);}
    node.prepend(...added);this.followBottom=false;node.scrollTop=top+node.scrollHeight-height;this.appliedTop=node.scrollTop;this.restore={top:node.scrollTop,bottom:false};this.remember();this.settlePosition();
  }
  toBottom(){this.followBottom=true;this.restore={top:0,bottom:true};this.applyPosition();this.remember();this.settlePosition();}
  applyPosition(){
    if(!this.restore)return;
    const node=this.container;node.scrollTop=this.restore.bottom?node.scrollHeight:this.restore.top;
    this.appliedTop=node.scrollTop;this.updateBottomButton();
  }
  settlePosition(){
    if(!this.restore || this.pending.size)return;
    if(typeof requestAnimationFrame!=='function'){this.remember();this.restore=null;this.finishLoad();return;}
    const target=this.restore;if(this.settling===target)return;this.settling=target;let previous=-1,stable=0,frames=0;
    const settle=()=>{
      if(this.restore!==target || !this.visible() || this.pending.size){if(this.settling===target)this.settling=null;return;}
      this.applyPosition();const height=this.container.scrollHeight;
      stable=height===previous?stable+1:0;previous=height;
      // content-visibility resolves estimated heights as the bottom comes into view.
      if(++frames<12 && stable<3)requestAnimationFrame(settle);
      else {this.remember();this.restore=null;this.settling=null;this.finishLoad();}
    };
    requestAnimationFrame(settle);
  }
  text(id){return this.items.get(id)?.text || '';}
  set(id,role,text){
    if(!id || !['user','assistant'].includes(role))return;
    const old=this.items.get(id);if(old?.text===text && old.role===role)return;
    this.items.set(id,{role,text});this.pending.add(id);this.schedule();
  }
  reset(){clearTimeout(this.timer);this.timer=null;this.items.clear();this.pending.clear();this.elements.clear();this.restore=null;this.appliedTop=null;this.resizeObserver?.disconnect();this.resizeObserver?.observe(this.container);this.container.replaceChildren();}
  reconcile(ids){for(const id of this.items.keys())if(!ids.has(id)){this.items.delete(id);this.pending.delete(id);const element=this.elements.get(id);if(element)this.resizeObserver?.unobserve(element);element?.remove();this.elements.delete(id);}}
  schedule(){if(!this.visible())return;if(!this.pending.size){this.layoutChanged();return;}if(this.timer)return;this.timer=setTimeout(()=>{this.timer=null;this.flush();},100);}
  flush(){
    if(!this.visible())return;
    const node=this.container,follow=this.followBottom;
    const fragment=document.createDocumentFragment(),start=performance.now();let count=0;
    for(const id of this.pending){
      const item=this.items.get(id);this.pending.delete(id);if(!item)continue;
      let element=this.elements.get(id);
      if(!element){element=document.createElement('article');element.className=`message ${item.role}`;const label=document.createElement('div');label.className='message-label';label.textContent=item.role==='user'?'YOU':'CODEX';const body=document.createElement('div');body.className='message-text';element.append(label,body);fragment.append(element);this.elements.set(id,element);this.resizeObserver?.observe(element);}
      element.lastChild.textContent=item.text;
      if(++count>=40 || performance.now()-start>8)break;
    }
    node.querySelector('.empty')?.remove();node.append(fragment);
    if(this.restore)this.applyPosition();
    else if(follow){node.scrollTop=node.scrollHeight;this.appliedTop=node.scrollTop;}
    if(!this.pending.size){this.remember();if(!this.restore)this.finishLoad();}
    this.updateBottomButton();this.schedule();
  }
};
