'use strict';
window.OgleAssistants=(()=>{
  const providers=[['codex','Codex','useCodex','chats'],['chatgpt','ChatGPT','useChatGPT','chatgpt'],['claude','Claude Code','useClaude','claude']];
  function enabled(settings,id){const p=providers.find(p=>p[0]===id||p[3]===id);return !p || (p[0]==='claude'?settings[p[2]]===true:settings[p[2]]!==false);}
  function apply({state,open,save}){
    for(const [id,,key,panel] of providers){
      const on=enabled(state.settings,id);
      document.querySelectorAll(`[data-panel="${panel}"],[data-chat-target="${id}"]`).forEach(node=>node.hidden=!on);
    }
    document.getElementById('status-dot').hidden=!enabled(state.settings,'codex');
    const compact=providers.filter(p=>p[0]!=='claude'&&enabled(state.settings,p[0]));
    document.body.classList.toggle('no-compact-assistant',!compact.length);
    if(!compact.some(p=>p[0]===state.settings.compactChatTarget)&&compact.length)save({compactChatTarget:compact[0][0]});
    if(!enabled(state.settings,state.pinnedPanel))window.OglePinnedPanel.unpin();
    if(!enabled(state.settings,state.activePanel))open(providers.find(p=>enabled(state.settings,p[0]))?.[3]||'notes');
  }
  async function choose({state,save,apply,setMode}){
    await setMode('expand');
    const dialog=document.createElement('dialog');dialog.id='assistant-choice';
    const heading=document.createElement('h1');heading.textContent='Which assistants do you use?';
    const note=document.createElement('p');note.textContent='Show only the tabs you need. Change these anytime in Settings → Assistants.';
    dialog.append(heading,note);
    const inputs=[];
    for(const [id,label,key] of providers){const row=document.createElement('label');row.className='settings-row';const input=document.createElement('input');input.type='checkbox';input.checked=enabled(state.settings,id);input.dataset.provider=id;row.append(label,input);dialog.append(row);inputs.push([key,input]);}
    const button=document.createElement('button');button.textContent='Continue';button.onclick=async()=>{
      button.disabled=true;
      try{await save({...Object.fromEntries(inputs.map(([key,input])=>[key,input.checked])),assistantsConfigured:true});dialog.close();dialog.remove();apply();await setMode('idle');}
      catch(err){button.disabled=false;window.OgleDiagnostics.record(err,'Assistant setup');}
    };
    dialog.append(button);dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);dialog.showModal();
  }
  return {providers,enabled,apply,choose};
})();
