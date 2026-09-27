'use strict';
window.OgleActivityStats=(()=>{
 let block=null,settings={},last={},unsubscribe=null;
 const rows=[['statsClicks','clicks','Clicks'],['statsKeys','keys','Keys'],['statsCpu','cpu','CPU'],['statsRam','ram','RAM']];
 function render(){if(!block)return;block.dataset.position=settings.statsPosition||'right';block.dataset.background=String(settings.statsBackground===true);block.style.setProperty('--stats-text-alpha',1-(settings.statsTextTransparency??0)/100);block.style.setProperty('--stats-background-alpha',1-(settings.statsBackgroundTransparency??45)/100);let visible=0;for(const [setting,key,label] of rows){const row=block.querySelector(`[data-stat="${key}"]`);row.hidden=settings[setting]===false;if(!row.hidden)visible++;const input=key==='clicks'||key==='keys',value=Number(last[key])||0;row.querySelector('b').textContent=input?(last.inputAvailable?value.toLocaleString():'—'):`${Math.round(value)}%`;row.title=input?'This Ogle session · input totals only, no typed text stored':`${label} · system usage`;}block.hidden=settings.statsVisible===false||!visible;}
 function configure(next){settings={...next};render();}
 async function init(api,next){if(block)return configure(next);block=document.createElement('aside');block.id='activity-stats';block.setAttribute('aria-label','Activity and system usage');for(const [,key,label] of rows){const row=document.createElement('div');row.dataset.stat=key;const name=document.createElement('span');name.textContent=label;const number=document.createElement('b');row.append(name,number);block.append(row);}document.querySelector('.pet-stage').append(block);configure(next);unsubscribe=api.onEvent(event=>{if(event.type==='activity-stats'){last=event;render();}});try{last=await api.activityStats();render();}catch{} }
 function dispose(){unsubscribe?.();block?.remove();block=null;}
 return {init,configure,dispose};
})();
