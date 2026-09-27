'use strict';
window.OgleActivityStats=(()=>{
 let block=null,settings={},last={},unsubscribe=null,resizeObserver=null,layoutObserver=null,positionFrame=0;
 const rows=[['statsClicks','clicks','Clicks'],['statsKeys','keys','Keys'],['statsCpu','cpu','CPU'],['statsRam','ram','RAM']];
 // Measure the transformed canvas, not the toolbar: its size and location can
 // change independently when the dock expands or a side panel is pinned.
 function position(){
  positionFrame=0;
  if(!block||block.hidden)return;
  const pet=document.querySelector('#pet'),stage=block.parentElement;
  if(!pet||!stage)return;
  const p=pet.getBoundingClientRect(),s=stage.getBoundingClientRect(),b=block.getBoundingClientRect();
  const placement=settings.statsPosition||'right',inset=4;
  let x=placement==='left'?p.left-b.width-12:placement==='top'?p.left+(p.width-b.width)/2:p.right+12;
  let y=placement==='top'?p.top+12:p.bottom-b.height-6;
  // Keep the optional two-pixel background outline inside the native window.
  x=Math.max(inset,Math.min(x,innerWidth-b.width-inset));
  y=Math.max(inset,Math.min(y,innerHeight-b.height-inset));
  block.style.left=`${x-s.left}px`;block.style.top=`${y-s.top}px`;
 }
 function schedulePosition(){if(!positionFrame)positionFrame=requestAnimationFrame(position);}
 function render(){if(!block)return;block.dataset.position=settings.statsPosition||'right';block.dataset.background=String(settings.statsBackground===true);block.style.setProperty('--stats-text-alpha',1-(settings.statsTextTransparency??0)/100);block.style.setProperty('--stats-background-alpha',1-(settings.statsBackgroundTransparency??45)/100);let visible=0;for(const [setting,key,label] of rows){const row=block.querySelector(`[data-stat="${key}"]`);row.hidden=settings[setting]===false;if(!row.hidden)visible++;const input=key==='clicks'||key==='keys',value=Number(last[key])||0;row.querySelector('b').textContent=input?(last.inputAvailable?value.toLocaleString():'—'):`${Math.round(value)}%`;row.title=input?'This Ogle session · input totals only, no typed text stored':`${label} · system usage`;}block.hidden=settings.statsVisible===false||!visible;schedulePosition();}
 function configure(next){settings={...next};render();}
 async function init(api,next){if(block)return configure(next);block=document.createElement('aside');block.id='activity-stats';block.setAttribute('aria-label','Activity and system usage');for(const [,key,label] of rows){const row=document.createElement('div');row.dataset.stat=key;const name=document.createElement('span');name.textContent=label;const number=document.createElement('b');row.append(name,number);block.append(row);}const stage=document.querySelector('.pet-stage');stage.append(block);
  resizeObserver=new ResizeObserver(schedulePosition);resizeObserver.observe(stage);resizeObserver.observe(document.querySelector('#pet'));
  layoutObserver=new MutationObserver(schedulePosition);for(const element of [document.documentElement,document.body,stage,document.querySelector('#pet')])layoutObserver.observe(element,{attributes:true,attributeFilter:['style','class']});
  window.addEventListener('resize',schedulePosition);document.addEventListener('scroll',schedulePosition,true);configure(next);unsubscribe=api.onEvent(event=>{if(event.type==='activity-stats'){last=event;render();}});try{last=await api.activityStats();render();}catch{} }
 function dispose(){unsubscribe?.();resizeObserver?.disconnect();layoutObserver?.disconnect();window.removeEventListener('resize',schedulePosition);document.removeEventListener('scroll',schedulePosition,true);cancelAnimationFrame(positionFrame);positionFrame=0;block?.remove();block=null;}
 return {init,configure,dispose};
})();
