'use strict';
window.PetDockSettings = (() => {
  function mount(root,api,settings,initialPets,save,apply,report,reloadPets,showChatGPT) {
    let pets=initialPets;
    const el=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
    const button=(text,action)=>{const node=el('button',text);node.onclick=()=>Promise.resolve().then(action).catch(report);return node;};
    const section=(title,description)=>{const node=el('section',null,'settings-section');node.append(el('h2',title));if(description)node.append(el('p',description));root.append(node);return node;};
    function select(section,label,key,options,fallback) {const row=el('label',null,'settings-row');row.append(el('span',label));const input=el('select');input.dataset.setting=key;for(const [value,text] of options)input.add(new Option(text,value));input.value=settings[key] ?? fallback;input.onchange=async()=>{try{await save({[key]:input.value});apply();}catch(err){report(err);}};row.append(input);section.append(row);return input;}
    function check(section,label,key,fallback) {const row=el('label',null,'settings-row');row.append(el('span',label));const input=el('input');input.type='checkbox';input.dataset.setting=key;input.checked=settings[key] ?? fallback;input.onchange=async()=>{try{await save({[key]:input.checked});apply();}catch(err){report(err);}};row.append(input);section.append(row);}
    root.append(el('h1','Settings'));
    const account=section('Accounts','Sign in through the official browser flow. Passwords are never entered into Ogle settings.');
    const accountStatus=el('p','Checking Codex account…','account-status');account.append(accountStatus);
    async function refreshAccount(){try{const result=await api.codexAccount();const value=result?.account ?? result;accountStatus.textContent=value?.email?`Codex: ${value.email}${value.planType?' · '+value.planType:''}`:value?.type?`Codex: ${value.type}`:'Codex: not signed in';}catch(err){accountStatus.textContent='Codex is not connected.';window.OgleDiagnostics.record(err,'Codex account');}}
    const accountActions=el('div',null,'settings-actions');accountActions.append(button('Sign in to Codex',async()=>{const result=await api.codexLogin();accountStatus.textContent=result?.message || 'Complete sign-in in your browser, then refresh account status.';}),button('Refresh account',refreshAccount),button('Sign out of Codex',async()=>{await api.codexLogout();await refreshAccount();}));account.append(accountActions);
    const chatActions=el('div',null,'settings-actions');chatActions.append(button('ChatGPT / sign in',async()=>{showChatGPT();await api.openChatGPT('login');}),button('Sign out of ChatGPT',async()=>{await api.openChatGPT('logout');}));account.append(chatActions);refreshAccount();
    const petSection=section('Pet','Right-click your pet for window controls. Drag the pet to move the dock.');
    select(petSection,'Click action','petClickAction',[['codex','Open Codex'],['animation','Play a random animation'],['expand','Open full panel'],['reveal','Show horizontal bar'],['toggle','Toggle full panel'],['chatgpt','Open ChatGPT panel'],['none','Do nothing']], 'reveal');
    const petSelect=select(petSection,'Character','petId',pets.map(p=>[p.id,p.name || p.config?.displayName || p.id]),settings.petId);
    const petCredit=el('p',null,'settings-hint');petCredit.dataset.petCredit='';
    function updatePetCredit(){const pet=pets.find(p=>p.id===petSelect.value);petCredit.replaceChildren(el('span',pet?.config?.author?'Created by '+pet.config.author:'Creator not supplied'));if(pet?.config?.sourceUrl){const link=button('Source',()=>api.openShortcut(pet.config.sourceUrl));petCredit.append(' / ',link);}}
    petSelect.addEventListener('change',updatePetCredit);petSection.append(petCredit);updatePetCredit();
    const libraryStatus=el('p','Pets are stored locally. Codex pets are copied at startup when available.','settings-hint');
    const refreshLibrary=button('Refresh library',async()=>{
      refreshLibrary.disabled=true;libraryStatus.textContent='Refreshing...';
      try {
        const result=await api.refreshPets();pets=await reloadPets();
        const selected=petSelect.value;petSelect.replaceChildren();
        for(const pet of pets)petSelect.add(new Option(pet.name || pet.id,pet.id));
        petSelect.value=pets.some(p=>p.id===selected)?selected:(pets[0]?.id || '');
        updatePetCredit();apply();libraryStatus.textContent=result.source==='codex'?'Library refreshed from Codex.':'Local library refreshed. Codex pets are unavailable.';
      } catch(err){libraryStatus.textContent='Could not refresh the library. See Debug for details.';window.OgleDiagnostics.record(err,'Pet library');}
      finally{refreshLibrary.disabled=false;}
    });
    petSection.append(refreshLibrary,libraryStatus);
    const sizeRow=el('label',null,'settings-row');sizeRow.append(el('span','Pet size'));const size=el('input');size.type='range';size.dataset.setting='petScale';size.min='.5';size.max='2';size.step='.1';size.value=settings.petScale || 1;const value=el('output',`${size.value}×`);size.oninput=()=>{value.textContent=`${size.value}×`;};size.onchange=()=>save({petScale:Number(size.value)}).then(apply).catch(report);sizeRow.append(size,value);petSection.append(sizeRow);
    const installRow=el('div',null,'settings-install');const source=el('input');source.placeholder='Pet name, install command, or HTTPS archive URL';source.setAttribute('aria-label','Install pet source');const installStatus=el('p',null,'settings-hint');
    async function installPetSource(value){if(!value.trim())return;installStatus.textContent='Installing…';try{const result=await api.installPet(value.trim());pets=result?.pets || await reloadPets();petSelect.replaceChildren();for(const pet of pets)petSelect.add(new Option(pet.name || pet.config?.displayName || pet.id,pet.id));if(result?.pet?.id){await save({petId:result.pet.id});petSelect.value=result.pet.id;}await reloadPets();updatePetCredit();apply();installStatus.textContent=result.codex?.status==='installed'?'Pet installed in Ogle and Codex.':result.codex?.status==='existing'?'Pet installed in Ogle. It is already in Codex.':result.codex?.warning?'Pet installed in Ogle; copying to Codex needs attention. See Debug.':'Pet installed in Ogle.';if(result.codex?.warning)window.OgleDiagnostics.record(result.codex.warning,'Codex pet installation');}catch(err){installStatus.textContent='Could not install this pet. Details are available in Settings → Debug.';window.OgleDiagnostics.record(err,'Pet installation');}}
    installRow.append(source,button('Install pet',()=>installPetSource(source.value)));petSection.append(installRow,installStatus);
    const recommendations=el('div',null,'settings-pet-recommendations');petSection.append(recommendations);
    if(api.recommendedPets)api.recommendedPets().then(items=>{if(!items.length)return;recommendations.append(el('h3','More pets'),el('p','Download a community pet from Codex Pets.','settings-hint'));for(const pet of items){const row=el('div',null,'settings-row');const info=el('span',pet.name+' by '+pet.author);info.title=pet.description;const download=button('Download',async()=>{download.disabled=true;try{await installPetSource(pet.id);}finally{download.disabled=false;}});download.setAttribute('aria-label','Download '+pet.name);row.append(info,button('Source',()=>api.openShortcut(pet.sourceUrl)),download);recommendations.append(row);}}).catch(err=>window.OgleDiagnostics.record(err,'Pet recommendations'));
    const appearance=section('Appearance');select(appearance,'Theme','theme',[['dark','Graphite'],['light','Paper'],['midnight','Midnight']], 'dark');
    const clock=section('Clock & date');check(clock,'Show time','showTime',true);select(clock,'Time format','timeFormat',[['24h','24-hour'],['12h','12-hour']], '24h');check(clock,'Show date','showDate',false);select(clock,'Date format','dateFormat',[['locale','System format'],['iso','YYYY-MM-DD']], 'locale');
    const behavior=section('Dock behavior','Automatic collapse shows the keep-open pin. Pin keeps only the full panel open. Collapse shows the horizontal bar first, then the ball after the same inactivity delay.');check(behavior,'Reveal toolbar when hovering the ball','autoExpand',true);check(behavior,'Automatically collapse when inactive','autoCollapse',true);check(behavior,'Show Codex task list','sidebarVisible',true);
    select(behavior,'Pinned panel position','pinnedPanelSide',[['left','Left'],['right','Right'],['bottom','Bottom']], 'left');
    select(behavior,'Horizontal chat bar','compactChatTarget',[['codex','Codex'],['chatgpt','ChatGPT — active conversation']], 'codex');
    const delayRow=el('label',null,'settings-row');delayRow.append(el('span','Auto-collapse delay (seconds)'));
    const delay=el('input');delay.type='number';delay.dataset.setting='autoCollapseDelay';delay.min='1';delay.max='120';delay.step='1';delay.value=String((settings.autoCollapseDelay ?? 7000)/1000);
    delay.onchange=async()=>{try{const seconds=Number(delay.value);if(!Number.isInteger(seconds)||seconds<1||seconds>120)throw new Error('Choose an auto-collapse delay from 1 to 120 seconds.');await save({autoCollapseDelay:seconds*1000});apply();}catch(err){delay.value=String((settings.autoCollapseDelay ?? 7000)/1000);report(err);}};
    delayRow.append(delay);behavior.append(delayRow);
    const stats=section('Counters & meters','Session totals only. Typed text is never recorded. CPU and RAM show system usage.');
    check(stats,'Show metrics','statsVisible',true);check(stats,'Background','statsBackground',false);
    for(const [key,label,fallback] of [['statsTextTransparency','Text transparency',0],['statsBackgroundTransparency','Background transparency',45]]){const row=el('label',null,'settings-row');row.append(el('span',label));const slider=el('input');slider.type='range';slider.min='0';slider.max='100';slider.step='5';slider.dataset.setting=key;slider.setAttribute('aria-label',label);slider.value=settings[key]??fallback;const output=el('output',slider.value+'%');slider.oninput=()=>{output.textContent=slider.value+'%';};slider.onchange=()=>save({[key]:Number(slider.value)}).then(apply).catch(report);row.append(slider,output);stats.append(row);}
    check(stats,'Mouse clicks','statsClicks',true);check(stats,'Keystrokes','statsKeys',true);check(stats,'CPU usage','statsCpu',true);check(stats,'RAM usage','statsRam',true);
    select(stats,'Block position','statsPosition',[['left','Left of pet'],['right','Right of pet'],['top','Above pet']], 'right');
    const hotkeys=section('Keyboard shortcuts','Use these anywhere in Windows. Leave empty to disable.');
    for(const [key,label,fallback] of [['shortcutVisibility','Show / hide Ogle','Control+Alt+O'],['shortcutPanel','Expand / collapse','Control+Alt+Space'],['shortcutBar','Horizontal bar / ball','Control+Alt+B'],['shortcutChatTarget','Switch Codex / ChatGPT','Control+Alt+T'],['shortcutCodex','Open Codex','Control+Alt+C'],['shortcutGpt','Open ChatGPT','Control+Alt+G'],['shortcutEditor','Open Editor','Control+Alt+E'],['shortcutShell','Open Shell','Control+Alt+X'],['shortcutLinks','Open Shortcuts','Control+Alt+S'],['shortcutPrompt','Write a prompt','Control+Alt+P']]){
      const row=el('label',null,'settings-row');row.append(el('span',label));const input=el('input');input.dataset.setting=key;input.value=settings[key] ?? fallback;input.placeholder=fallback;input.setAttribute('aria-label',label+' shortcut');
      const status=el('span',null,'settings-hint');status.setAttribute('role','status');
      input.onkeydown=event=>{if(event.key==='Tab')return;event.preventDefault();if(event.key==='Backspace'||event.key==='Delete'){input.value='';return;}if(['Control','Alt','Shift','Meta'].includes(event.key))return;const parts=[];if(event.ctrlKey)parts.push('Control');if(event.altKey)parts.push('Alt');if(event.shiftKey)parts.push('Shift');if(event.metaKey)parts.push('Super');if(!parts.length)return;parts.push(event.code==='Space'?'Space':event.key.length===1?event.key.toUpperCase():event.key.replace('Arrow',''));input.value=parts.join('+');};
      const applyButton=button('Set',async()=>{const previous=settings[key] ?? fallback;try{await save({[key]:input.value.trim()});status.textContent='Saved';}catch(err){settings[key]=previous;input.value=previous;status.textContent='Unavailable — choose another shortcut';throw err;}});
      row.append(input,applyButton);hotkeys.append(row,status);
    }
    const startup=section('Windows startup','Start Ogle when you sign in to Windows. Ogle starts Codex only when it is not already running.');check(startup,'Start with Windows','autoStart',true);
    const admin=section('Administrator terminals','Administrator accounts can approve a protected helper for access across restarts. Standard accounts use Windows administrator approval once per Ogle session.');
    const adminStatus=el('p','Checking administrator access…','settings-hint'),adminActions=el('div',null,'settings-actions');
    const enable=button('Enable administrator access',async()=>{enable.disabled=true;try{await api.terminalEnableAdmin();await refreshAdmin();}finally{enable.disabled=false;}});
    const disable=button('Remove administrator access',async()=>{disable.disabled=true;try{await api.terminalDisableAdmin();await refreshAdmin();}finally{disable.disabled=false;}});
    async function refreshAdmin(){try{const result=await api.terminalAdminStatus();enable.hidden=result.enabled || !result.available;disable.hidden=!result.enabled;adminStatus.textContent=result.enabled?'Persistent administrator access is enabled.':result.reason==='standard-account'?'Admin shells ask for Windows administrator approval once per Ogle session. Persistent access requires an administrator Windows account.':result.available?'The first Admin shell asks Windows once to install the protected helper.':'Persistent access is available in the packaged app. Development shells use approval per session.';}catch(err){adminStatus.textContent='Administrator access status is unavailable.';window.OgleDiagnostics.record(err,'Administrator helper');}}
    adminActions.append(enable,disable,button('Close administrator shells',async()=>{await api.terminalReleaseAdmin();await refreshAdmin();}));admin.append(adminActions,adminStatus);refreshAdmin();
    const debug=section('Debug','Technical diagnostics for developers and troubleshooting.');
    const debugActions=el('div',null,'settings-actions');
    debugActions.append(button('Open debug log',()=>window.OgleDiagnostics.open()));debug.append(debugActions);
    window.OgleSettingsNavigation.mount(root);
  }
  return {mount};
})();
