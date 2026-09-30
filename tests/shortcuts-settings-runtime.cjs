'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`hotkeys-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:'',shortcutCodex:'',shortcutGpt:'',shortcutEditor:'',shortcutShell:'',shortcutLinks:'',shortcutPrompt:''}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
 await page.evaluate(()=>switchPanel('settings'));
 const input=page.getByRole('textbox',{name:'Show / hide Ogle shortcut',exact:true});await input.click();await input.press('Control+Alt+F11');await input.locator('..').getByRole('button',{name:'Set',exact:true}).click();
 await page.waitForFunction(()=>state.settings.shortcutVisibility==='Control+Alt+F11');await page.evaluate(()=>saveQueue);
 assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Alt+F11')),true);
 const panel=page.getByRole('textbox',{name:'Expand / collapse shortcut',exact:true});await panel.click();await panel.press('Control+Alt+F11');await panel.locator('..').getByRole('button',{name:'Set',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-setting="shortcutPanel"]').value==='');
 assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Alt+F11')),true);
 await input.click();await input.press('Backspace');await input.locator('..').getByRole('button',{name:'Set',exact:true}).click();await page.evaluate(()=>saveQueue);
 assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Alt+F11')),false);
 const bar=page.getByRole('textbox',{name:'Horizontal bar / ball shortcut',exact:true});await bar.click();await bar.press('Control+Alt+F10');await bar.locator('..').getByRole('button',{name:'Set',exact:true}).click();await page.evaluate(()=>saveQueue);
 assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Alt+F10')),true);
 await bar.click();await bar.press('Backspace');await bar.locator('..').getByRole('button',{name:'Set',exact:true}).click();await page.evaluate(()=>saveQueue);
 assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Alt+F10')),false);
 await app.evaluate(({globalShortcut})=>{const register=globalShortcut.register.bind(globalShortcut);globalShortcut.register=(key,callback)=>{if(key==='Control+Alt+F9')global.targetShortcut=callback;return register(key,callback);};});
 const target=page.getByRole('textbox',{name:'Switch Codex / ChatGPT shortcut',exact:true});await target.click();await target.press('Control+Alt+F9');await target.locator('..').getByRole('button',{name:'Set',exact:true}).click();await page.evaluate(()=>saveQueue);
 assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Alt+F9')),true);
 await page.evaluate(async()=>{state.selected={id:'shortcut-fixture',name:'Shortcut fixture'};await setMode('quick');});await page.locator('#prompt').fill('Codex draft');
 await app.evaluate(()=>global.targetShortcut());await page.waitForFunction(()=>state.composerContext==='__chatgpt__');await page.locator('#prompt').fill('ChatGPT draft');
 await app.evaluate(()=>global.targetShortcut());await page.waitForFunction(()=>state.composerContext==='shortcut-fixture');assert.equal(await page.locator('#prompt').inputValue(),'Codex draft');assert.equal(await page.locator('#prompt').evaluate(el=>el===document.activeElement),true);
 await app.evaluate(()=>global.targetShortcut());await page.waitForFunction(()=>state.composerContext==='__chatgpt__');assert.equal(await page.locator('#prompt').inputValue(),'ChatGPT draft');
 await page.evaluate(()=>setMode('idle'));await app.evaluate(()=>global.targetShortcut());await page.waitForFunction(()=>state.mode==='reveal'&&!DockLayoutTransition.busy);
 assert.equal(await page.evaluate(()=>state.settings.compactChatTarget),'codex');
 await page.evaluate(()=>switchPanel('settings'));await target.click();await target.press('Backspace');await target.locator('..').getByRole('button',{name:'Set',exact:true}).click();await page.evaluate(()=>saveQueue);assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Alt+F9')),false);
 // Capture real callbacks at registration, then exercise the same callback used by Windows.
 const direct=[['shortcutCodex','Open Codex','chats'],['shortcutGpt','Open ChatGPT','chatgpt'],['shortcutEditor','Open Editor','editor'],['shortcutShell','Open Shell','terminal'],['shortcutLinks','Open Shortcuts','shortcuts'],['shortcutPrompt','Write a prompt',null]];
 await app.evaluate(({globalShortcut})=>{const register=globalShortcut.register.bind(globalShortcut);global.directCallbacks={};globalShortcut.register=(key,callback)=>{global.directCallbacks[key]=callback;return register(key,callback)};});
 for(const [index,[key,label,panelName]] of direct.entries()){
  await page.evaluate(()=>switchPanel('settings'));
  const field=page.getByRole('textbox',{name:label+' shortcut',exact:true});const accelerator='Control+Alt+F'+(index+1);
  await field.click();await field.press(accelerator);await field.locator('..').getByRole('button',{name:'Set',exact:true}).click();await page.evaluate(()=>saveQueue);
  await page.evaluate(()=>setMode('idle'));await app.evaluate((_electron,key)=>global.directCallbacks[key](),accelerator);
  if(panelName)await page.waitForFunction(name=>state.activePanel===name&&state.mode==='expand',panelName);
  else await page.waitForFunction(()=>state.mode==='quick'&&document.activeElement===document.querySelector('#prompt'));
 }
 console.log('Shortcut settings capture, real OS registration, conflict rollback and disable passed');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
