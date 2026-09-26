'use strict';
window.OgleLinksTools={
  mount(root,api,report){
    const tools=document.createElement('section');tools.className='links-tools';tools.setAttribute('aria-label','Run and Windows tools');
    const run=document.createElement('form');run.className='links-tool-row';
    const command=document.createElement('input');command.id='links-run';command.placeholder='Run a program, folder, URL or command…';command.setAttribute('aria-label','Run command');command.autocomplete='off';command.spellcheck=false;
    const launch=document.createElement('button');launch.type='submit';launch.textContent='Run';
    run.append(command,launch);
    const row=document.createElement('div');row.className='links-tool-row';
    const select=document.createElement('select');select.id='windows-tool';select.setAttribute('aria-label','Windows tools');select.add(new Option('Windows tools…',''));
    const open=document.createElement('button');open.type='button';open.textContent='Open';open.disabled=true;
    select.onchange=()=>open.disabled=!select.value;row.append(select,open);
    const status=document.createElement('p');status.className='links-tool-status';status.setAttribute('role','status');status.hidden=true;
    const show=text=>{status.textContent=text;status.hidden=!text;};
    run.onsubmit=async event=>{
      event.preventDefault();const value=command.value.trim();if(!value||launch.disabled)return;
      launch.disabled=true;show('Opening…');
      try{await api.runCommand(value);show('Opened');if(command.value.trim()===value)command.value='';}
      catch(error){show('Could not open that command. Check its name or path.');report(error);}
      finally{launch.disabled=false;}
    };
    open.onclick=async()=>{if(!select.value||open.disabled)return;open.disabled=true;show('Opening…');try{await api.openWindowsTool(select.value);show('Opened');}catch(error){show('This tool could not be opened. It may need an optional Windows feature.');report(error);}finally{open.disabled=!select.value;}};
    if(api.listWindowsTools)api.listWindowsTools().then(items=>{for(const item of items){const option=new Option(item.label+(item.available===false?' (not installed)':''),item.id);option.disabled=item.available===false;select.add(option);}}).catch(report);
    const search=document.createElement('form');search.className='links-tool-row';
    const query=document.createElement('input');query.id='links-file-search';query.placeholder='Search filenames with Everything…';query.setAttribute('aria-label','Search filenames with Everything');
    const find=document.createElement('button');find.type='submit';find.textContent='Search';
    const clear=document.createElement('button');clear.type='button';clear.textContent='Clear';clear.hidden=true;
    const results=document.createElement('div');results.className='links-search-results';results.hidden=true;results.setAttribute('aria-label','File search results');
    let generation=0;
    clear.onclick=()=>{generation++;query.value='';results.replaceChildren();results.hidden=true;clear.hidden=true;show('');};
    search.onsubmit=async event=>{
      event.preventDefault();const value=query.value.trim();if(!value||find.disabled)return;
      const current=++generation;find.disabled=true;show('Searching…');clear.hidden=false;
      try{
        const result=await api.searchFiles(value);if(current!==generation)return;
        results.replaceChildren();results.hidden=false;
        if(result.status==='setup'){show(result.message || 'Install Everything and its ES command-line tool to search filenames here.');const help=document.createElement('button');help.type='button';help.textContent='Everything setup ↗';help.onclick=()=>api.openShortcut('https://www.voidtools.com/support/everything/command_line_interface/').catch(report);results.append(help);return;}
        if(result.status!=='ok'){show(result.message || 'Search is unavailable. Check that Everything is running.');return;}
        const paths=result.results || [];
        show(paths.length?`${paths.length} result${paths.length===1?'':'s'}${paths.length>=100?' (first 100)':''}`:'No matching files.');
        for(const item of paths){const target=typeof item==='string'?item:item.path;const button=document.createElement('button');button.type='button';button.textContent=target;button.title=target;button.onclick=()=>api.openShortcut(target).catch(report);results.append(button);}
      }catch(error){if(current===generation){show('Search is unavailable. Check that Everything is running.');report(error);}}
      finally{find.disabled=false;}
    };
    search.append(query,find,clear);tools.append(run,row,search,status,results);root.append(tools);
  }
};
