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
    async function refreshAccount(){try{const result=await api.codexAccount();const value=result?.account ?? result;accountStatus.textContent=value?.email?`Codex: ${value.email}${value.planType?' · '+value.planType:''}`:value?.type?`Codex: ${value.type}`:'Codex: not signed in';}catch(err){accountStatus.textContent=`Account status unavailable: ${err.message}`;}}
    const accountActions=el('div',null,'settings-actions');accountActions.append(button('Sign in to Codex',async()=>{const result=await api.codexLogin();accountStatus.textContent=result?.message || 'Complete sign-in in your browser, then refresh account status.';}),button('Refresh account',refreshAccount),button('Sign out of Codex',async()=>{await api.codexLogout();await refreshAccount();}));account.append(accountActions);
    const chatActions=el('div',null,'settings-actions');chatActions.append(button('ChatGPT / sign in',async()=>{showChatGPT();await api.openChatGPT('login');}),button('Sign out of ChatGPT',async()=>{await api.openChatGPT('logout');}));account.append(chatActions);refreshAccount();
    const petSection=section('Pet','Right-click your pet for window controls. Drag the pet to move the dock.');
    const petSelect=select(petSection,'Character','petId',pets.map(p=>[p.id,p.name || p.config?.displayName || p.id]),settings.petId);
    const sizeRow=el('label',null,'settings-row');sizeRow.append(el('span','Pet size'));const size=el('input');size.type='range';size.dataset.setting='petScale';size.min='.5';size.max='2';size.step='.1';size.value=settings.petScale || 1;const value=el('output',`${size.value}×`);size.oninput=()=>{value.textContent=`${size.value}×`;};size.onchange=()=>save({petScale:Number(size.value)}).then(apply).catch(report);sizeRow.append(size,value);petSection.append(sizeRow);
    const installRow=el('div',null,'settings-install');const source=el('input');source.placeholder='Pet name, install command, or HTTPS archive URL';source.setAttribute('aria-label','Install pet source');const installStatus=el('p',null,'settings-hint');
    installRow.append(source,button('Install pet',async()=>{if(!source.value.trim())return;installStatus.textContent='Installing…';try{const result=await api.installPet(source.value.trim());pets=result?.pets || await reloadPets();petSelect.replaceChildren();for(const pet of pets)petSelect.add(new Option(pet.name || pet.config?.displayName || pet.id,pet.id));if(result?.pet?.id){await save({petId:result.pet.id});petSelect.value=result.pet.id;}await reloadPets();apply();installStatus.textContent='Pet installed.';}catch(err){installStatus.textContent=`Install failed: ${err.message}`;}}));petSection.append(installRow,installStatus);
    const appearance=section('Appearance');select(appearance,'Theme','theme',[['dark','Graphite'],['light','Paper'],['midnight','Midnight']], 'dark');
    const clock=section('Clock & date');check(clock,'Show time','showTime',true);select(clock,'Time format','timeFormat',[['24h','24-hour'],['12h','12-hour']], '24h');check(clock,'Show date','showDate',false);select(clock,'Date format','dateFormat',[['locale','System format'],['iso','YYYY-MM-DD']], 'locale');
    const behavior=section('Dock behavior','Pin keeps only the full panel open. Collapse shows the horizontal bar first, then the ball after the same inactivity delay.');check(behavior,'Reveal toolbar on hover','autoExpand',true);check(behavior,'Show Codex task list','sidebarVisible',true);
    select(behavior,'Horizontal chat bar','compactChatTarget',[['codex','Codex'],['chatgpt','ChatGPT — active conversation']], 'codex');
    const delayRow=el('label',null,'settings-row');delayRow.append(el('span','Auto-collapse delay (seconds)'));
    const delay=el('input');delay.type='number';delay.dataset.setting='autoCollapseDelay';delay.min='1';delay.max='120';delay.step='1';delay.value=String((settings.autoCollapseDelay ?? 10000)/1000);
    delay.onchange=async()=>{try{const seconds=Number(delay.value);if(!Number.isInteger(seconds)||seconds<1||seconds>120)throw new Error('Choose an auto-collapse delay from 1 to 120 seconds.');await save({autoCollapseDelay:seconds*1000});apply();}catch(err){delay.value=String((settings.autoCollapseDelay ?? 10000)/1000);report(err);}};
    delayRow.append(delay);behavior.append(delayRow);
    const startup=section('Windows startup','Start Ogle when you sign in to Windows. Ogle starts Codex only when it is not already running.');check(startup,'Start with Windows','autoStart',true);
    const admin=section('Administrator terminals','Admin shells reuse one Windows approval until Ogle exits or you release access. Releasing closes every administrator shell.');
    const adminStatus=el('p',null,'settings-hint'),adminActions=el('div',null,'settings-actions');
    adminActions.append(button('Release admin access',async()=>{await api.terminalReleaseAdmin();adminStatus.textContent='Administrator shells closed and access released. The next Admin shell will ask Windows again.';}));admin.append(adminActions,adminStatus);
  }
  return {mount};
})();
