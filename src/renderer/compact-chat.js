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
  for(const [value,label] of [['codex','Codex — choose a task'],['chatgpt','ChatGPT — active conversation']]) {
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
