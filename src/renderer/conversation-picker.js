'use strict';
window.OgleConversationPicker=(()=>{
 function render(){
  const node=$('compact-thread-list'),position=node.scrollTop,query=$('compact-search').value.toLowerCase(),pins=state.settings.pinnedThreads||[];
  const groups=new Map();
  for(const thread of state.threads.filter(t=>!query||`${title(t)} ${t.cwd}`.toLowerCase().includes(query))){const key=thread.cwd||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(thread);}
  node.replaceChildren();
  for(const [cwd,threads] of groups){
   const group=document.createElement('div');group.className='compact-project';group.setAttribute('role','group');group.setAttribute('aria-label',basename(cwd));
   const heading=document.createElement('div');heading.className='compact-project-name';heading.textContent=basename(cwd);heading.title=cwd;group.append(heading);
   for(const thread of threads.sort((a,b)=>Number(pins.includes(b.id))-Number(pins.includes(a.id)))){
    const option=document.createElement('button');option.type='button';option.className='compact-thread';option.dataset.threadId=thread.id;option.setAttribute('role','option');option.setAttribute('aria-selected',String(thread.id===state.selected?.id));option.textContent=(pins.includes(thread.id)?'★ ':'')+title(thread);option.title=title(thread);
    option.onclick=()=>attempt(async()=>{await setMode('quick');await selectThread(thread);$('prompt').focus();});group.append(option);
   }node.append(group);
  }
  if(!groups.size){const empty=document.createElement('p');empty.textContent='No matching conversations';node.append(empty);}
  node.scrollTop=position;$('compact-load-more').hidden=!state.cursor;
 }
 function mount(){
  $('compact-search').oninput=render;$('compact-load-more').onclick=()=>attempt(()=>refresh(true));
  $('conversation-picker-toggle').setAttribute('aria-haspopup','listbox');
  $('conversation-picker-toggle').onclick=()=>setMode(state.mode==='picker'?'reveal':'picker').then(()=>{if(state.mode==='picker')$('compact-search').focus();});
  $('conversation-name').onclick=()=>setMode(compactUsesChatGPT()||state.selected?'quick':'picker').then(()=>{(compactUsesChatGPT()||state.selected?$('prompt'):$('compact-search')).focus();});
  $('conversation-picker').addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();setMode('reveal').then(()=>$('conversation-picker-toggle').focus());return;}
   if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
   if(['Home','End'].includes(event.key)&&event.target===$('compact-search'))return;
   const options=[...$('compact-thread-list').querySelectorAll('[role=option]')];if(!options.length)return;event.preventDefault();let index=options.indexOf(document.activeElement);
   index=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowDown'?(index+1)%options.length:(index<=0?options.length:index)-1;options[index].focus();
  });
  document.addEventListener('pointerdown',event=>{if(state.mode==='picker'&&!event.target.closest('#conversation-picker,#conversation-picker-toggle,#conversation-name'))setMode('reveal');});
 }
 return{render,mount};
})();
