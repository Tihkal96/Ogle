'use strict';
window.OgleDockCommands={mount({state,api,openPanel,setMode,save,applySettings,layout,report}){
  const el=id=>document.getElementById(id);
  let invokingChat=null,originNative=false;
  const panels=[['chats','Codex','Tasks and conversations'],['chatgpt','ChatGPT','Classic ChatGPT'],['notes','Notes','Scratchpad'],['editor','Editor','Code and text files'],['terminal','Shell','CMD and PowerShell'],['shortcuts','Links','Shortcuts, file search and Run'],['settings','Settings','Preferences and accounts']];
  async function showPanel(id){
    await openPanel(id);
    if(id==='chatgpt'){await api.openChatGPT('focus');return;}
    const selectors={notes:'#note',editor:'.cm-content',terminal:'.terminal-session:not([hidden]) .xterm-helper-textarea',chats:state.selected?'#prompt':'#search'};
    const panel=el(id+'-panel');
    (document.querySelector(selectors[id] || '#'+id+'-panel input') || panel.querySelector('button'))?.focus();
  }
  window.OgleCommands.mount({
    commands:()=>{
      const commands=panels.map(([id,label,hint])=>({id,label:'Open '+label,hint,run:()=>showPanel(id)}));
      commands.push({id:'settings-search',label:'Find a setting',hint:'Search preferences',run:async()=>{await openPanel('settings');el('settings-panel').querySelector('[aria-label="Search settings"]').focus();}});
      const chat=invokingChat;
      if(chat)commands.push({id:'find',label:'Find in conversation',hint:'Ctrl+F',run:()=>window.OgleChatFind.open(chat)});
      if(!state.pinnedPanel)commands.push({id:'prompt',label:'Write a prompt',hint:state.settings.compactChatTarget==='chatgpt'?'ChatGPT':'Codex',run:async()=>{await setMode('quick');el('prompt').focus();}},{id:'collapse',label:'Collapse to horizontal bar',hint:'Keep the pet visible',run:()=>setMode('reveal')});
      commands.push({id:'top',label:state.settings.alwaysOnTop===false?'Keep Ogle on top':'Stop keeping Ogle on top',hint:'Window',run:async()=>{state.settings.alwaysOnTop=await api.windowAction('pin');applySettings();}},{id:'metrics',label:state.settings.statsVisible===false?'Show metrics':'Hide metrics',hint:'CPU, RAM and input counters',run:async()=>{await save({statsVisible:state.settings.statsVisible===false});applySettings();}});
      return commands;
    },
    beforeOpen:async(context)=>{
      const focused=document.activeElement;originNative=context?.target==='chatgpt';
      invokingChat=originNative?'chatgpt':focused?.closest('#chats-panel,#composer')?'chats':focused?.closest('#chatgpt-panel')?'chatgpt':['chats','chatgpt'].includes(state.activePanel)?state.activePanel:null;
      window.OgleChatFind.close();await setMode('expand');
    },
    visibility:(open,detail)=>{layout();if(!open&&detail?.restore&&originNative&&state.mode==='expand'&&(state.activePanel==='chatgpt'||state.pinnedPanel==='chatgpt'))api.openChatGPT('focus').catch(report);}
  });
}};
