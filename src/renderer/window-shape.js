'use strict';
window.OgleWindowShape=(()=>{
  let scheduled=false,last='';
  const selector='#pet,#activity-stats,#side-panel,#panel-menu,#chat-target-menu,#conversation-picker,dialog[open],.cm-tooltip';
  function rectangles(){
    const elements=[...document.querySelectorAll(selector),document.querySelector(document.body.classList.contains('bar-idle')?'#bar-orb':'.shell')];
    return elements.filter(el=>el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>{
      const r=el.getBoundingClientRect();return {x:r.x-2,y:r.y-2,width:r.width+4,height:r.height+4};
    });
  }
  async function update(){
    scheduled=false;const rects=rectangles(),key=JSON.stringify([innerWidth,innerHeight,rects]);
    if(key===last)return;
    try{await window.dock.windowShape(rects);last=key;}catch(error){window.OgleDiagnostics?.record(error,'Window click-through');}
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
  const resize=new ResizeObserver(schedule);resize.observe(document.body);
  const observed=new Set();
  const observeElements=()=>{
    for(const el of observed)if(!el.isConnected){resize.unobserve(el);observed.delete(el);}
    for(const el of document.querySelectorAll(selector+',.shell,#bar-orb'))if(!observed.has(el)){resize.observe(el);observed.add(el);}
    schedule();
  };
  new MutationObserver(mutations=>{
    let changed=false,added=false;
    for(const mutation of mutations){
      if(mutation.type==='attributes')changed ||= mutation.target.matches('body,#dock,#workspace,.pet-stage,.shell,'+selector);
      else for(const node of [...mutation.addedNodes,...mutation.removedNodes]){
        if(node.nodeType===1&&(node.matches(selector)||node.querySelector(selector))){changed=true;added=true;}
      }
    }
    if(added)observeElements();else if(changed)schedule();
  }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open']});
  window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);observeElements();
  return {rectangles,update};
})();
