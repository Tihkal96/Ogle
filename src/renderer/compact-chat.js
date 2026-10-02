'use strict';
async function sendCompactChatGPT() {
  const key='__chatgpt__',text=$('prompt').value.trim(),attachments=window.PetDockAttachments?.getInputs() || [];
  persistDraft();state.chatgptSending=true;updateComposer();
  try {
    await switchPanel('chatgpt');
    await api.chatgptSend({text,attachments});
    window.PetDockAttachments?.clear(key,attachments);
    if(state.composerContext===key) {
      if($('prompt').value.trim()===text) {$('prompt').value='';persistDraft();}
    } else if((state.settings.drafts?.[key] || '').trim()===text)await save({drafts:{...state.settings.drafts,[key]:''}});
  } finally {
    state.chatgptSending=false;updateComposer();resetPanelIdle();
  }
}
async function chooseCompactTarget() {
  await setMode('expand');
  const dialog=document.createElement('dialog');dialog.id='compact-chat-choice';
  const heading=document.createElement('h1');heading.textContent='Where should the chat bar send?';
  const description=document.createElement('p');description.textContent='Choose the destination for the horizontal bar. You can change this later in Settings.';
  const actions=document.createElement('div');actions.className='settings-actions';
  dialog.append(heading,description,actions);document.body.append(dialog);
  dialog.addEventListener('cancel',event=>event.preventDefault());
  for(const [value,label] of [['codex','Codex — choose a task'],['chatgpt','ChatGPT — active conversation']].filter(([id])=>window.OgleAssistants.enabled(state.settings,id))) {
    const button=document.createElement('button');button.type='button';button.dataset.compactChoice=value;button.textContent=label;
    button.onclick=()=>attempt(async()=>{
      for(const item of actions.children)item.disabled=true;
      try {await save({compactChatTarget:value});dialog.close();dialog.remove();applySettings();await setMode('idle');}
      catch(err){for(const item of actions.children)item.disabled=false;throw err;}
    });
    actions.append(button);
  }
  dialog.showModal();
}

function closeChatTargetMenu(){
  $('chat-target-menu').hidden=true;$('chat-target-toggle').setAttribute('aria-expanded','false');
}
function openChatTargetMenu(){
  const menu=$('chat-target-menu');menu.hidden=false;
  $('chat-target-toggle').setAttribute('aria-expanded','true');
  for(const button of menu.children)button.setAttribute('aria-checked',String(button.dataset.chatTarget===(state.settings.compactChatTarget || 'codex')));
  (menu.querySelector('[aria-checked="true"]:not([hidden])')||menu.querySelector('button:not([hidden])'))?.focus();
}
async function setCompactChatTarget(target){
  if(!window.OgleAssistants.enabled(state.settings,target))return;
  persistDraft();await save({compactChatTarget:target});closeChatTargetMenu();applySettings();
  if(state.mode==='picker')await setMode('reveal');
  if(state.mode==='quick')$('prompt').focus();
}
async function toggleCompactChatTarget(){
  const target=compactUsesChatGPT()?'codex':'chatgpt';
  if(!window.OgleAssistants.enabled(state.settings,target))return;
  await setCompactChatTarget(target);
  if(state.mode!=='quick')await setMode('reveal');
}
function mountChatTargetMenu(){
  $('chat-target-toggle').onclick=()=>{$('chat-target-menu').hidden?openChatTargetMenu():closeChatTargetMenu();};
  $('conversation-strip').oncontextmenu=event=>{event.preventDefault();openChatTargetMenu();};
  for(const button of $('chat-target-menu').children)button.onclick=()=>attempt(async()=>{
    persistDraft();await save({compactChatTarget:button.dataset.chatTarget});closeChatTargetMenu();applySettings();
    if(state.mode==='picker')await setMode('reveal');
    if(state.mode==='quick')$('prompt').focus();
  });
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#chat-target-menu,#chat-target-toggle'))closeChatTargetMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('chat-target-menu').hidden){closeChatTargetMenu();$('chat-target-toggle').focus();}});
  $('chat-target-menu').addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const buttons=[...$('chat-target-menu').children].filter(button=>!button.hidden);buttons[(buttons.indexOf(document.activeElement)+1)%buttons.length].focus();}});
}
