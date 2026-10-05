'use strict';
window.OgleHistoryMenu = {
  init({api,state,save,refresh,report,onDialogChange=()=>{}}) {
    let dialog = null;
    const label = (provider,cwd) => state.settings.projectNames?.[provider]?.[cwd] || String(cwd || '').split(/[\\/]/).filter(Boolean).pop() || 'Project';
    const hidden = (provider,cwd) => Boolean(state.settings.hiddenProjects?.[provider]?.[cwd]);
    const close = () => {dialog?.remove();dialog=null;onDialogChange();};
    const element = (tag,text) => {const node=document.createElement(tag);if(text !== undefined)node.textContent=text;return node;};
    function show(title) {
      close();dialog=element('dialog');dialog.className='history-dialog';dialog.append(element('h3',title));
      dialog.addEventListener('cancel',close);document.body.append(dialog);dialog.showModal();onDialogChange();return dialog;
    }
    async function rename(target) {
      const panel=show(target.kind==='project'?'Rename project label':'Rename conversation');
      const input=element('input');input.maxLength=160;input.value=target.kind==='project'?label(target.provider,target.cwd):target.name || '';input.setAttribute('aria-label','Name');
      const controls=element('div'),confirm=element('button','Save'),cancel=element('button','Cancel');confirm.type=cancel.type='button';controls.append(confirm,cancel);panel.append(input,controls);
      cancel.onclick=close;
      const submit=async()=>{if(confirm.disabled || dialog !== panel)return;const name=input.value.trim();if(!name){input.focus();return;}confirm.disabled=true;
        try {if(target.kind==='project'){const all=state.settings.projectNames || {};await save({projectNames:{...all,[target.provider]:{...all[target.provider],[target.cwd]:name}}});}
          else await api.renameConversation(target.provider,target.id,name);
          if(dialog === panel)close();await refresh(target.provider);
        }catch(error){report(error);}finally{confirm.disabled=false;}
      };
      confirm.onclick=submit;input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submit();}});input.focus();input.select();
    }
    async function archives(provider) {
      const panel=show('Archived conversations'),loading=element('p','Loading…'),cancel=element('button','Close');panel.append(loading,cancel);cancel.onclick=close;
      const result=await api.listArchivedConversations(provider);if(dialog !== panel)return;
      loading.remove();const threads=result?.threads || [];if(!threads.length)panel.insertBefore(element('p','No archived conversations'),cancel);
      for(const thread of threads){const row=element('div'),name=element('span',thread.name || thread.title || thread.id),restore=element('button','Restore');restore.type='button';row.append(name,restore);panel.insertBefore(row,cancel);
        restore.onclick=async()=>{restore.disabled=true;try{await api.restoreConversation(provider,thread.id);row.remove();await refresh(provider);}catch(error){report(error);restore.disabled=false;}};
      }
    }
    async function open(target) {
      try {
        const action=await api.historyMenu(target);if(!action)return;
        if(action==='rename')return rename(target);
        if(action==='archives'||action==='restore')return await archives(target.provider);
        if(action==='show-hidden'){const all=state.settings.hiddenProjects || {};await save({hiddenProjects:{...all,[target.provider]:{}}});return await refresh(target.provider);}
        if(action==='archive'||action==='hide'){
          if(target.kind==='project'){const all=state.settings.hiddenProjects || {};await save({hiddenProjects:{...all,[target.provider]:{...all[target.provider],[target.cwd]:true}}});}
          else {const result=await api.removeConversation(target.provider,target.id);if(result?.cancelled)return;}
          return await refresh(target.provider);
        }
      }catch(error){report(error);}
    }
    return {open,label,hidden,close};
  }
};
