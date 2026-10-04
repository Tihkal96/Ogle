'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','assistants-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({assistantsConfigured:false,autoStart:false,autoCollapse:false,autoExpand:false,compactChatTarget:'codex',statsClicks:false,statsKeys:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:''}));
 fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'ogle-assistants-test',main:'main.cjs'}));
 fs.writeFileSync(path.join(profile,'main.cjs'),`
 const {EventEmitter}=require('node:events');global.sent=[];
 require(${JSON.stringify(path.join(root,'src/main/codex-bridge.cjs'))}).CodexBridge=class extends EventEmitter{
 constructor(){super();global.testBridge=this;}async connect(){this.emit('status',{state:'connected'});return {};}
 async listThreads(){return {data:[{id:'fixture',name:'Fixture task',cwd:'C:/fixture'}]};}
 async listModels(){return {data:[{model:'fixture-model',displayName:'Fixture model',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium'},{reasoningEffort:'high'}]}]};}
 async readThread(id){return {thread:{id,turns:[]},runtime:{running:false}};}
 async sendTurn(...args){global.sent.push(args);return {turn:{id:'turn-'+global.sent.length}};}
 close(){} };
 require(${JSON.stringify(path.join(root,'src/main/claude-bridge.cjs'))}).ClaudeBridge=class{
 constructor(options){global.fakeClaude=this;this.onEvent=options.onEvent;this.creates=[];this.writes=[];}status(){return {installed:true};}
 listThreads(){return {threads:[{id:'claude-history',title:'Claude fixture',cwd:'C:/fixture'}]};}
 create(options){this.creates.push(options);this.onEvent({type:'claude-terminal',event:'data',id:'claude-session',data:'Claude fixture ready\\r\\n'});return {id:'claude-session'};}
 write(id,data){this.writes.push({id,data});}resize(){}close(){}dispose(){} };
 require(${JSON.stringify(path.join(root,'src/main/main.cjs'))});`);
 execFileSync(process.execPath,['--check',path.join(profile,'main.cjs')]);const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[profile],env});
 try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);
 await page.locator('#assistant-choice').waitFor().catch(async e=>{console.log(await page.evaluate(()=>({text:document.body.innerText,state:typeof state==='undefined'?null:state.bootReady})));throw e;});
 await page.locator('#assistant-choice [data-provider="chatgpt"]').uncheck();await page.locator('#assistant-choice [data-provider="claude"]').check();
 await page.locator('#assistant-choice button').click();await page.waitForFunction(()=>state.bootReady&&!DockLayoutTransition.busy&&!document.querySelector('#assistant-choice'));
 assert.equal(await page.locator('[data-panel="chatgpt"]').first().isVisible(),false);
 assert.equal(await page.evaluate(()=>state.settings.assistantsConfigured&&state.settings.useClaude&&!state.settings.useChatGPT),true);
 await page.evaluate(()=>switchPanel('settings'));await page.waitForFunction(()=>!DockLayoutTransition.busy);
 await page.locator('[data-setting="useChatGPT"]').check();await page.waitForFunction(()=>state.settings.useChatGPT);
 assert.equal(await page.locator('[data-panel="chatgpt"]').first().isVisible(),true);
 await page.locator('[data-setting="useChatGPT"]').uncheck();await page.waitForFunction(()=>!state.settings.useChatGPT);
 assert.equal(await page.locator('[data-panel="chatgpt"]').first().isVisible(),false);
 await page.evaluate(()=>switchPanel('chats'));await page.waitForFunction(()=>!DockLayoutTransition.busy);
 await page.evaluate(()=>selectThread({id:'fixture',name:'Fixture task',cwd:'C:/fixture'}));
 await page.locator('#codex-model').selectOption('fixture-model');await page.locator('#codex-effort').selectOption('high');
 await page.locator('#prompt').fill('fixture prompt one');await page.locator('#send').click();
 await page.waitForFunction(()=>state.running.has('fixture'));
 assert.deepEqual(await app.evaluate(()=>global.sent[0].slice(1)),['fixture prompt one',[],{model:'fixture-model',effort:'high'}]);
 await page.locator('#prompt').fill('fixture queued prompt');await page.locator('#send').click();
 await page.waitForFunction(()=>codexQueue.list('fixture').length===1);
 await page.locator('#codex-effort').selectOption('medium');
 await app.evaluate(()=>global.testBridge.emit('notification',{method:'turn/completed',params:{threadId:'fixture',turn:{id:'turn-1',status:'completed'}}}));
 await page.waitForFunction(()=>codexQueue.list('fixture').length===0);
 assert.deepEqual(await app.evaluate(()=>global.sent[1].slice(1)),['fixture queued prompt',[],{model:'fixture-model',effort:'high'}]);
 await page.evaluate(()=>switchPanel('notes'));
 await page.evaluate(()=>OglePinnedPanel.pin('claude'));
 await page.waitForFunction(()=>document.querySelector('#claude-list button'));
 await page.evaluate(()=>OglePinnedPanel.unpin());
 await page.evaluate(()=>switchPanel('claude'));await page.waitForFunction(()=>!DockLayoutTransition.busy);
 await page.locator('#claude-list button').click();await page.locator('#claude-sessions button').waitFor();
 assert.equal(await app.evaluate(()=>global.fakeClaude.creates[0].resume),'claude-history');
 await page.locator('#claude-views .xterm-screen').click();
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 assert.deepEqual(await app.evaluate(()=>global.fakeClaude.writes.map(w=>w.data)),['\u001b[B','\r']);
 await page.locator('#claude-up').click();await page.locator('#claude-enter').click();
 assert.deepEqual(await app.evaluate(()=>global.fakeClaude.writes.map(w=>w.data)),['\u001b[B','\r','\u001b[A','\r']);


 const activity=state=>app.evaluate((_e,state)=>global.fakeClaude.onEvent({type:'claude-activity',threadId:'claude-session',state}),state);
 await page.evaluate(()=>{state.running.clear();visualActivity.clear();updatePetState();});
 await activity('working');await page.waitForFunction(()=>state.petState==='running');
 await activity('waiting');await page.waitForFunction(()=>state.petState==='waiting');
 await page.evaluate(()=>switchPanel('notes'));await activity('done');await page.waitForFunction(()=>state.claudeUnread&&state.petState==='review');
 await page.evaluate(()=>switchPanel('claude'));await page.waitForFunction(()=>!state.claudeUnread&&state.petState==='idle');
 await page.screenshot({path:path.join(profile,'claude-panel.png')});console.log('Screenshot: '+path.join(profile,'claude-panel.png'));
 await page.evaluate(()=>OglePinnedPanel.pin('claude'));await page.waitForFunction(()=>state.pinnedPanel==='claude'&&state.activePanel==='editor');
 await page.evaluate(()=>OglePanelView.enter('claude'));await page.waitForFunction(()=>state.fullscreenPanel==='claude');
 await page.evaluate(()=>OglePanelView.zoom('claude',1.3));assert.equal(await page.locator('#claude-panel').evaluate(el=>el.style.getPropertyValue('--content-zoom')),'1.3');
 await page.evaluate(()=>OglePanelView.exit());await page.evaluate(()=>OglePinnedPanel.unpin());
 await page.evaluate(()=>switchPanel('claude'));
 await page.evaluate(async()=>{await save({useCodex:false,useClaude:false,useChatGPT:false});applySettings();});
 await page.waitForFunction(()=>state.activePanel==='notes');
 assert.equal(await page.locator('[data-panel="chats"]').first().isVisible(),false);assert.equal(await page.locator('[data-panel="claude"]').first().isVisible(),false);
 console.log('PASS assistant onboarding/provider visibility; Codex model/effort including queued snapshot; Claude resume, activity acknowledgement, pin/fullscreen/zoom.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});




