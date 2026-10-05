"use strict";
window.OglePinnedPanel=(()=>{
  const names={chats:'Codex',chatgpt:'ChatGPT',claude:'Claude Code','claude-web':'Claude',editor:'Editor',terminal:'Shell',shortcuts:'Links'};
  let state,api,open,refresh,report,menuTarget,appliedSide=null,queue=Promise.resolve();
  const el=id=>document.getElementById(id);
  function visible(name){return state.activePanel===name || state.pinnedPanel===name;}
  function hideMenu(){el('panel-menu').hidden=true;}
  function render(){
    const pinned=state.pinnedPanel;
    document.body.dataset.pinnedSide=pinned?(state.settings.pinnedPanelSide || 'left'):'';
    el('side-panel').hidden=!pinned;
    for(const panel of document.querySelectorAll('.panel'))panel.hidden=!visible(panel.id.replace(/-panel$/,''));
    for(const button of document.querySelectorAll('[data-panel]')){
      button.classList.toggle('selected',button.dataset.panel===state.activePanel);
      button.classList.toggle('tab-pinned',button.dataset.panel===pinned);
      button.setAttribute('aria-pressed',String(state.mode==='expand' && visible(button.dataset.panel)));
    }
    const composer=el('composer');
    if(pinned==='chats')el('side-panel-content').append(composer);
    else if(composer.parentElement!==document.querySelector('.shell'))document.querySelector('.shell').insertBefore(composer,document.querySelector('.shell > footer'));
    composer.hidden=!(state.mode==='quick' || (state.mode==='expand' && visible('chats')));
    el('collapse').disabled=Boolean(pinned);
    if(pinned)el('collapse').title='Close the pinned panel to collapse';
  }
  function enqueue(action){const next=queue.then(action);queue=next.catch(report);return next;}
  function pin(name){return enqueue(async()=>{
    if(!names[name])return;
    const old=state.pinnedPanel,previous=state.activePanel;
    await api.setPinnedPanel(state.settings.pinnedPanelSide || 'left');
    if(old)el('expanded').append(el(old+'-panel'));
    state.pinnedPanel=name;appliedSide=state.settings.pinnedPanelSide || 'left';
    el('side-panel-content').append(el(name+'-panel'));
    el('side-panel-title').textContent=names[name];hideMenu();
    await open(previous===name?(name==='editor'?'terminal':'editor'):previous);
    if(name==='chatgpt')await api.openChatGPT('show');
    if(name==='claude-web')await api.openClaudeWeb('show');
    if(name==='claude')await window.OgleClaude.open();
    refresh();
  });}
  function unpin(){return enqueue(async()=>{
    if(!state.pinnedPanel)return;
    await api.setPinnedPanel(null);
    el('expanded').append(el(state.pinnedPanel+'-panel'));
    state.pinnedPanel=null;appliedSide=null;hideMenu();await open(state.activePanel);refresh();
  });}
  function configure(){
    const side=state.settings.pinnedPanelSide || 'left';
    if(!state.pinnedPanel || side===appliedSide)return;
    appliedSide=side;
    enqueue(async()=>{if(!state.pinnedPanel)return;await api.setPinnedPanel(side);await open(state.activePanel);refresh();});
  }
  function init(options){
    ({state,api,open,refresh,report}=options);
    for(const button of document.querySelectorAll('[data-panel]')){
      if(!names[button.dataset.panel])continue;
      button.addEventListener('contextmenu',event=>{
        event.preventDefault();menuTarget=button.dataset.panel;
        const menu=el('panel-menu');menu.hidden=false;
        const r=button.getBoundingClientRect();menu.style.left=Math.min(r.left,innerWidth-menu.offsetWidth-8)+'px';menu.style.top=Math.min(r.bottom+3,innerHeight-menu.offsetHeight-8)+'px';
        el('pin-tab').focus();
      });
    }
    el('pin-tab').onclick=()=>pin(menuTarget).catch(report);
    el('side-panel-close').onclick=()=>unpin().catch(report);
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('#panel-menu'))hideMenu();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')hideMenu();});
    window.addEventListener('resize',hideMenu);
  }
  return {init,render,visible,pin,unpin,configure,hideMenu};
})();
