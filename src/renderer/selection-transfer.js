'use strict';
window.OgleSelectionTransfer=(()=>{
  let options,pending=Promise.resolve();
  const append=(before,text)=>before?before+(before.endsWith('\n')?'':'\n')+text:text;
  function selectedText(target){
    if(target?.closest?.('#editor-panel .editor-surface'))return window.PetDockEditor?.getSelection()||'';
    if(target?.closest?.('#terminal-panel .terminal-views'))return window.PetDockTerminal?.getSelection()||'';
    const field=target?.closest?.('textarea,input');
    if(field){if(field.type==='password')return '';return typeof field.selectionStart==='number'?field.value.slice(field.selectionStart,field.selectionEnd):'';}
    const selection=window.getSelection();
    if(!selection || selection.isCollapsed)return '';
    return target?.contains?.(selection.anchorNode)||selection.containsNode(target,true)?selection.toString():'';
  }
  async function paste({target,text}){
    if(typeof text!=='string'||!text.length||text.length>100000)throw new Error('Select between 1 and 100,000 characters to paste into another panel.');
    const next=pending.then(()=>performPaste({target,text}));
    pending=next.catch(()=>{});
    return next;
  }
  async function performPaste({target,text}){
    const {state,api,openPanel,save,updateComposer}=options;
      if(target==='chatgpt'){await openPanel('chatgpt');await api.chatgptPaste(text);await api.openChatGPT('focus');}
      else if(target==='codex'){
        await openPanel('chats');const input=document.getElementById('prompt'),value=append(input.value,text);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
        await save({drafts:{...state.settings.drafts,[state.composerContext]:value}});updateComposer();input.focus();input.setSelectionRange(value.length-text.length,value.length);
      }else if(target==='notes'){
        await openPanel('notes');const input=document.getElementById('note'),value=append(input.value,text);input.value=value;await save({note:value});document.getElementById('note-status').textContent='Saved locally';input.focus();input.setSelectionRange(value.length-text.length,value.length);
      }else if(target==='editor'){await openPanel('editor');await window.PetDockEditor.newFromText(text);}
      else if(['powershell','cmd','admin-powershell','admin-cmd'].includes(target)){await openPanel('terminal');await window.PetDockTerminal.stageText({shell:target.endsWith('powershell')?'powershell':'cmd',admin:target.startsWith('admin-'),text});}
      else throw new Error('Unknown paste destination.');
  }
  function mount(config){
    options=config;
    document.addEventListener('contextmenu',event=>{
      const text=selectedText(event.target);if(!text)return;
      event.preventDefault();event.stopPropagation();options.api.selectionMenu(text).catch(options.report);
    },true);
  }
  return {mount,paste,selectedText};
})();
