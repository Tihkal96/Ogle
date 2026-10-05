'use strict';
// Provider indicators stay independent when more than one assistant is active.
window.OgleAssistantActivity = {
  render({codex = false, chatgpt = 'idle', claude = 'idle', pageFailed = false, pageMessage = ''} = {}) {
    const labels = {idle:'',working:'Working',waiting:'Needs attention',done:'Done',failed:'Failed'};
    for(const [panel,name,raw] of [['chats','Codex',codex?'working':'idle'],['chatgpt','ChatGPT',pageFailed?'failed':chatgpt],['claude','Claude Code',claude]]) {
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
      const sources=[codex?'Codex':null,chatgpt==='working'?'ChatGPT':null,claude==='working'?'Claude Code':null].filter(Boolean);
      const description=pet.dataset.actionLabel+(sources.length?' · Working: '+sources.join(', '):'');
      if(pet.title!==description){pet.title=description;pet.setAttribute('aria-label',description);}
    }
    const status = document.getElementById('chatgpt-activity-status');
    if(status) {
      const text = pageFailed ? 'Load failed · reload to retry' : labels[chatgpt] || '';
      const title = pageFailed ? String(pageMessage || text) : (text ? 'ChatGPT · '+text : '');
      if(status.textContent !== text)status.textContent = text;
      if(status.title !== title)status.title = title;
      const activity = pageFailed ? 'failed' : Object.hasOwn(labels,chatgpt) ? chatgpt : 'idle';
      if(status.getAttribute('data-activity') !== activity)status.setAttribute('data-activity',activity);
    }
  }
};
