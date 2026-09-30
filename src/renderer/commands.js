'use strict';
window.OgleCommands=(()=>{
  let options,dialog,input,list,status,previousFocus,items=[],selected=0,opening=false,openToken=0;
  const normalize=value=>String(value || '').toLocaleLowerCase();
  function render(){
    const words=normalize(input.value).trim().split(/\s+/).filter(Boolean);
    items=options.commands().filter(command=>words.every(word=>normalize(`${command.label} ${command.hint || ''}`).includes(word)));
    selected=Math.max(0,Math.min(selected,items.length-1));list.replaceChildren();
    items.forEach((command,index)=>{
      const item=document.createElement('button');item.type='button';item.className='command-option';item.id=`ogle-command-${index}`;item.setAttribute('role','option');item.setAttribute('aria-selected',String(index===selected));item.tabIndex=-1;
      const label=document.createElement('span');label.textContent=command.label;item.append(label);
      if(command.hint){const hint=document.createElement('small');hint.textContent=command.hint;item.append(hint);}
      item.onpointermove=()=>{if(selected!==index){selected=index;updateSelection();}};
      item.onclick=()=>execute(index);list.append(item);
    });
    status.textContent=items.length?'↑ ↓ to choose · Enter to open · Esc to close':'No matching commands';updateSelection();
  }
  function updateSelection(){
    [...list.children].forEach((item,index)=>item.setAttribute('aria-selected',String(index===selected)));
    const active=list.children[selected];if(active){input.setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
  }
  function close(restore=true){
    openToken++;if(!dialog?.open)return;dialog.close();options.visibility?.(false,{restore});
    if(restore && previousFocus?.isConnected)previousFocus.focus();
  }
  async function execute(index){
    const command=items[index];if(!command || !dialog.open)return;
    close(false);
    try{await command.run();}catch(error){window.OgleDiagnostics?.record(error,'Command palette');}
  }
  async function open(context){
    if(opening || dialog?.open)return;opening=true;const token=++openToken;previousFocus=document.activeElement;
    try{await options.beforeOpen?.(context);if(token!==openToken)return;input.value='';selected=0;dialog.showModal();options.visibility?.(true);render();input.focus();}
    catch(error){window.OgleDiagnostics?.record(error,'Command palette');}
    finally{opening=false;}
  }
  function mount(config){
    options=config;dialog=document.createElement('dialog');dialog.className='ogle-commands';dialog.setAttribute('aria-label','Commands');
    const header=document.createElement('div');header.className='command-header';
    input=document.createElement('input');input.type='search';input.placeholder='Search commands…';input.setAttribute('aria-label','Search commands');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','true');input.setAttribute('aria-controls','ogle-command-list');
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='×';dismiss.title='Close (Esc)';dismiss.setAttribute('aria-label','Close commands');dismiss.onclick=()=>close();header.append(input,dismiss);
    list=document.createElement('div');list.id='ogle-command-list';list.className='command-list';list.setAttribute('role','listbox');list.setAttribute('aria-label','Available commands');status=document.createElement('footer');status.setAttribute('aria-live','polite');dialog.append(header,list,status);document.body.append(dialog);
    input.oninput=()=>{selected=0;render();};dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(items.length){selected=(selected+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;updateSelection();}}else if(event.key==='Enter' && event.target!==dismiss){event.preventDefault();execute(selected);}});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}});
    document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.shiftKey&&!event.altKey&&event.key.toLowerCase()==='p'){event.preventDefault();event.stopPropagation();if(dialog.open)close();else open();}},true);
  }
  return {mount,open,close,isOpen:()=>Boolean(dialog?.open)};
})();
