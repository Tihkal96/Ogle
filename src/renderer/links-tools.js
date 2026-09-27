'use strict';
window.OgleLinksTools={
  mount(root,api,report,settings={},save=patch=>api.saveSettings(patch)){
    const tools=document.createElement('section');tools.className='links-tools';tools.setAttribute('aria-label','Run, Windows tools and search');
    const controls=document.createElement('div');controls.className='links-tools-controls';
    const status=document.createElement('p');status.className='links-tool-status';status.setAttribute('role','status');status.hidden=true;
    const show=text=>{status.textContent=text;status.hidden=!text;};
    const run=document.createElement('form');run.className='links-tool-row';
    const command=document.createElement('input');command.id='links-run';command.placeholder='Run…';command.title='Run a program, folder, URL or command';command.setAttribute('aria-label','Run command');command.autocomplete='off';command.spellcheck=false;
    const launch=document.createElement('button');launch.type='submit';launch.textContent='Run';run.append(command,launch);
    run.onsubmit=async event=>{
      event.preventDefault();const value=command.value.trim();if(!value||launch.disabled)return;
      launch.disabled=true;show('Opening…');
      try{await api.runCommand(value);show('Opened');if(command.value.trim()===value)command.value='';}
      catch(error){show('Could not open that command. Check its name or path.');report(error);}
      finally{launch.disabled=false;}
    };
    const select=document.createElement('select');select.id='windows-tool';select.setAttribute('aria-label','Windows tools');select.add(new Option('Windows tools…',''));
    select.onchange=async()=>{
      if(!select.value||select.disabled)return;select.disabled=true;show('Opening…');
      try{await api.openWindowsTool(select.value);show('Opened');}
      catch(error){show('This Windows tool could not be opened.');report(error);}
      finally{select.value='';select.disabled=false;}
    };
    if(api.listWindowsTools)api.listWindowsTools().then(items=>{for(const item of items){const option=new Option(item.label+(item.available===false?' (not installed)':''),item.id);option.disabled=item.available===false;select.add(option);}}).catch(report);
    const search=document.createElement('form');search.className='links-tool-row';
    const query=document.createElement('input');query.id='links-file-search';query.placeholder='Search files…';query.title='Search file names and paths on local drives';query.setAttribute('aria-label','Search files');query.autocomplete='off';
    const clear=document.createElement('button');clear.type='button';clear.textContent='×';clear.title='Clear search';clear.setAttribute('aria-label','Clear search');clear.hidden=true;
    const folderLabel=document.createElement('label');folderLabel.className='links-search-folders';folderLabel.title='Include folders in search results';const folders=document.createElement('input');folders.type='checkbox';folders.checked=settings.includeSearchFolders===true;folders.setAttribute('aria-label','Include folders');folderLabel.append(folders,document.createTextNode('Folders'));
    const results=document.createElement('div');results.className='links-search-results';results.hidden=true;results.setAttribute('aria-label','File search results');
    let generation=0,timer,busy=false,pending=false;
    const visible=()=>!root.hidden&&!document.body.classList.contains('collapsed');
    function reset(){generation++;clearTimeout(timer);pending=false;results.replaceChildren();results.hidden=true;clear.hidden=!query.value;show('');}
    clear.onclick=()=>{query.value='';reset();query.focus();};
    async function searchNow(revision){
      if(revision!==generation||!query.value.trim()||!visible())return;
      if(busy){pending=true;return;}
      busy=true;pending=false;const value=query.value.trim();show('Searching…');
      try{
        const result=await api.searchFiles(value,{includeFolders:folders.checked});if(revision!==generation)return;
        results.replaceChildren();results.hidden=false;
        if(result.status!=='ok'){
          show(result.message || 'Search is preparing.');
          if(['initializing','busy'].includes(result.status))timer=setTimeout(()=>searchNow(generation),1500);
          return;
        }
        const paths=result.results || [];
        show(`${paths.length?`${paths.length} result${paths.length===1?'':'s'}${paths.length>=100?' (first 100)':''}`:'No matching files'}${result.scope?' · '+result.scope:''}`);
        for(const item of paths){const target=typeof item==='string'?item:item.path;const button=document.createElement('button');button.type='button';button.textContent=target;button.title=target;button.onclick=()=>api.openShortcut(target).catch(report);results.append(button);}
      }catch(error){if(revision===generation){show('Search could not finish. Try again in a moment.');report(error);}}
      finally{busy=false;if(pending){pending=false;clearTimeout(timer);timer=setTimeout(()=>searchNow(generation),300);}}
    }
    query.oninput=()=>{reset();if(query.value.trim())timer=setTimeout(()=>searchNow(generation),300);};
    search.onsubmit=event=>{event.preventDefault();clearTimeout(timer);searchNow(generation);};
    const visibilityObserver=new MutationObserver(()=>{if(!visible())clearTimeout(timer);else if(query.value.trim()){clearTimeout(timer);timer=setTimeout(()=>searchNow(generation),300);}});
    visibilityObserver.observe(root,{attributes:true,attributeFilter:['hidden']});visibilityObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
    folders.onchange=()=>{save({includeSearchFolders:folders.checked}).catch(report);reset();if(query.value.trim())timer=setTimeout(()=>searchNow(generation),0);};
    search.append(query,clear,folderLabel);controls.append(run,select,search);tools.append(controls,status,results);root.append(tools);
  }
};
