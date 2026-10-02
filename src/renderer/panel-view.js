'use strict';
window.OglePanelView=(()=>{
  const names={chats:'Codex',chatgpt:'ChatGPT',claude:'Claude Code',notes:'Notes',editor:'Editor',terminal:'Shell',shortcuts:'Links',settings:'Settings'};
  const scrollHolds=new Map();
  const factors=new Map();let active=null,busy=false,options,bar;
  const el=id=>document.getElementById(id);
  function holdScroll(name,panel){
    // Font/layout changes can scroll through browser anchoring even when the
    // wheel event was cancelled. Keep offsets through deferred editor layout.
    const positions=scrollHolds.get(name)?.positions || [panel,...panel.querySelectorAll('*')]
      .filter(node=>node.clientHeight && (node.scrollHeight>node.clientHeight || node.scrollWidth>node.clientWidth))
      .map(node=>({node,top:node.scrollTop,left:node.scrollLeft}));
    const hold={positions};scrollHolds.set(name,hold);
    const restore=()=>{if(scrollHolds.get(name)!==hold)return;for(const {node,top,left} of positions){node.scrollTop=top;node.scrollLeft=left;}};
    return ()=>{restore();requestAnimationFrame(()=>{restore();requestAnimationFrame(()=>{restore();if(scrollHolds.get(name)===hold)scrollHolds.delete(name);});});};
  }
  function zoom(name,factor,fromNative=false){
    if(!options)return;
    factor=Math.max(.6,Math.min(2,Math.round(factor*10)/10));factors.set(name,factor);
    const panel=el(name+'-panel');if(!panel)return;
    const restoreScroll=name==='chats'||name==='chatgpt'?null:holdScroll(name,panel);
    panel.style.setProperty('--content-zoom',factor);
    if(name==='chatgpt'){if(!fromNative)options.api.chatgptZoom(factor).catch(options.report);}
    else if(name==='claude')window.OgleClaude?.setZoom(factor);
    else if(name==='notes')el('note').style.fontSize=13*factor+'px';
    else if(name==='editor')window.PetDockEditor?.measure();
    else if(name==='terminal')window.PetDockTerminal?.setZoom(factor);
    else if(name==='chats'){el('messages').style.zoom=factor;options.chatLayout?.();}
    else if(name==='shortcuts')panel.querySelector('.links-content').style.zoom=factor;
    else if(name==='settings')for(const section of panel.querySelectorAll('.settings-section'))section.style.zoom=factor;
    restoreScroll?.();
    if(active===name)el('panel-zoom-reset').textContent=Math.round(factor*100)+'%';
    requestAnimationFrame(()=>{options.layout();window.OgleWindowShape?.update();});
  }
  function step(name,direction){zoom(name,(factors.get(name)||1)+direction*.1);}
  async function enter(name){
    if(busy||active||!names[name])return;busy=true;
    try{
      active=name;options.state.fullscreenPanel=name;
      document.body.classList.add('panel-fullscreen');document.body.dataset.fullscreenPanel=name;
      el(name+'-panel').dataset.fullscreen='true';bar.hidden=false;el('fullscreen-panel-name').textContent=names[name];
      el('panel-zoom-reset').textContent=Math.round((factors.get(name)||1)*100)+'%';
      options.idle();await options.api.panelFullscreen(true);
      await new Promise(requestAnimationFrame);options.layout();window.PetDockTerminal?.resize();window.PetDockEditor?.measure();
      el('exit-panel-fullscreen').focus();
    }catch(error){restore();options.report(error);}finally{busy=false;}
  }
  function restore(){
    const old=active;active=null;options.state.fullscreenPanel=null;
    document.body.classList.remove('panel-fullscreen');delete document.body.dataset.fullscreenPanel;
    if(old)delete el(old+'-panel').dataset.fullscreen;bar.hidden=true;
    options.idle();return old;
  }
  async function exit(){
    if(!active)return;
    const old=restore();await options.api.panelFullscreen(false);
    await new Promise(requestAnimationFrame);options.layout();window.PetDockTerminal?.resize();window.PetDockEditor?.measure();
    el(old+'-panel').querySelector('.panel-fullscreen-button')?.focus();
  }
  function init(config){
    options=config;bar=document.createElement('nav');bar.id='panel-fullscreen-bar';bar.hidden=true;bar.setAttribute('aria-label','Fullscreen controls');
    const title=document.createElement('strong');title.id='fullscreen-panel-name';bar.append(title);
    for(const [id,text,label,action] of [['panel-zoom-out','−','Zoom out',()=>step(active,-1)],['panel-zoom-reset','100%','Reset zoom',()=>zoom(active,1)],['panel-zoom-in','＋','Zoom in',()=>step(active,1)],['exit-panel-fullscreen','⤢','Exit fullscreen (Esc)',()=>exit().catch(options.report)]]){
      const button=document.createElement('button');button.id=id;button.textContent=text;button.title=label;button.setAttribute('aria-label',label);button.onclick=action;bar.append(button);
    }
    el('dock').prepend(bar);
    for(const [name,label] of Object.entries(names)){
      const panel=el(name+'-panel'),button=document.createElement('button');button.type='button';button.className='panel-fullscreen-button';button.textContent='⛶';button.title='Fullscreen '+label;button.setAttribute('aria-label',button.title);button.onclick=()=>enter(name);panel.prepend(button);
    }
    for(const type of ['pointerdown','keydown'])document.addEventListener(type,()=>scrollHolds.clear(),{capture:true});
    document.addEventListener('wheel',event=>{
      if(!event.ctrlKey)scrollHolds.clear();
      if(!event.ctrlKey||!event.deltaY)return;const panel=event.target.closest?.('.panel');if(!panel)return;
      const name=panel.id.replace(/-panel$/,'');if(!names[name])return;
      event.preventDefault();event.stopImmediatePropagation();step(name,event.deltaY<0?1:-1);
    },{capture:true,passive:false});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();event.stopImmediatePropagation();exit().catch(options.report);}},{capture:true});
  }
  return {init,enter,exit,zoom,step,resetZoom:name=>zoom(name,1),get active(){return active;}};
})();
