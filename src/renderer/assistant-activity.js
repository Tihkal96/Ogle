'use strict';
// Provider indicators stay independent when more than one assistant is active.
window.OgleAssistantActivity = {
  render({codex = false, chatgpt = 'idle', claude = 'idle', claudeWeb = 'idle', claudeWebPageFailed = false, claudeWebPageMessage = '', pageFailed = false, pageMessage = ''} = {}) {
    const labels = {idle:'',working:'Working',waiting:'Needs attention',done:'Done',failed:'Failed'};
    for(const [panel,name,raw] of [['chats','Codex',codex?'working':'idle'],['chatgpt','ChatGPT',pageFailed?'failed':chatgpt],['claude','Claude Code',claude],['claude-web','Claude',claudeWebPageFailed?'failed':claudeWeb]]) {
      const state = Object.hasOwn(labels,raw) ? raw : 'idle';
      const button = document.querySelector('[data-panel="'+panel+'"]');
      if(!button)continue;
      const label = labels[state], description = name + (label ? ' · '+label : '');
      if(state === 'idle') {if(button.hasAttribute('data-activity'))button.removeAttribute('data-activity');}
      else if(button.getAttribute('data-activity') !== state)button.setAttribute('data-activity',state);
      if(button.title !== description)button.title = description;
      if(button.getAttribute('aria-label') !== description)button.setAttribute('aria-label',description);
    }
    const pet=document.getElementById('pet');
    if(pet?.dataset?.actionLabel){
      const sources=[codex?'Codex':null,chatgpt==='working'?'ChatGPT':null,claude==='working'?'Claude Code':null,claudeWeb==='working'?'Claude':null].filter(Boolean);
      const description=pet.dataset.actionLabel+(sources.length?' · Working: '+sources.join(', '):'');
      if(pet.title!==description){pet.title=description;pet.setAttribute('aria-label',description);}
    }
    for(const [id,name,activity,failed,message] of [['chatgpt','ChatGPT',chatgpt,pageFailed,pageMessage],['claude-web','Claude',claudeWeb,claudeWebPageFailed,claudeWebPageMessage]]){
      const status=document.getElementById(id+'-activity-status');if(!status)continue;
      const text=failed?'Load failed · reload to retry':labels[activity]||'';
      const title=failed?String(message||text):(text?name+' · '+text:'');
      if(status.textContent!==text)status.textContent=text;if(status.title!==title)status.title=title;
      const state=failed?'failed':Object.hasOwn(labels,activity)?activity:'idle';if(status.getAttribute('data-activity')!==state)status.setAttribute('data-activity',state);
    }
  }
};
