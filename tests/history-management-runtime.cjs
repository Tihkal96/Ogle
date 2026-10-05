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
 create(options){this.creates.push(options);if(this.earlyExit){this.onEvent({type:'claude-terminal',event:'data',id:'claude-session',data:'Early failure'});this.onEvent({type:'claude-terminal',event:'exit',id:'claude-session',exitCode:1});return {id:'claude-session'};}this.onEvent({type:'claude-terminal',event:'data',id:'claude-session',data:'Claude fixture ready\\r\\n'});return {id:'claude-session'};}
 write(id,data){this.writes.push({id,data});}resize(){}close(){}dispose(){} };
 require(${JSON.stringify(path.join(root,'src/main/main.cjs'))});`);
 execFileSync(process.execPath,['--check',path.join(profile,'main.cjs')]);const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[profile],env});
 try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);
 await page.locator('#assistant-choice').waitFor().catch(async e=>{console.log(await page.evaluate(()=>({text:document.body.innerText,state:typeof state==='undefined'?null:state.bootReady})));throw e;});
 await page.locator('#assistant-choice [data-provider="chatgpt"]').uncheck();await page.locator('#assistant-choice [data-provider="claude"]').check();
 await page.locator('#assistant-choice button').click();await page.waitForFunction(()=>state.bootReady&&!DockLayoutTransition.busy&&!document.querySelector('#assistant-choice'));

 await page.evaluate(async()=>{await setMode('expand');window.historyTest={action:'rename',cancelled:false,renames:[],removes:[],restores:[]};historyMenu=OgleHistoryMenu.init({state,save,report:error,onDialogChange:chatgptLayout,refresh:async()=>{renderProjects();renderThreads();},api:{historyMenu:async()=>historyTest.action,renameConversation:async(provider,id,name)=>{historyTest.renames.push({provider,id,name});const thread=state.threads.find(t=>t.id===id);thread.name=name;if(state.selected?.id===id){state.selected=thread;$('thread-title').textContent=title(thread);}},removeConversation:async()=>{if(historyTest.cancelled)return {cancelled:true};state.threads=[];return {};},listArchivedConversations:async()=>({threads:[{id:'archived',name:'Old chat'}]}),restoreConversation:async(provider,id)=>{historyTest.restores.push(id);}}});window.OgleHistory=historyMenu;});
 await page.locator('#thread-list .thread').click({button:'right'});
 await page.locator('.history-dialog input').fill('Renamed chat');await page.locator('.history-dialog input').press('Enter');
 await page.waitForFunction(()=>document.querySelector('#thread-list').textContent.includes('Renamed chat'));
 assert.equal(await page.evaluate(()=>historyTest.renames[0].name),'Renamed chat');
 await page.evaluate(()=>historyTest.action='rename');await page.locator('#thread-list .thread-project').click({button:'right'});
 await page.locator('.history-dialog input').fill('Work project');await page.locator('.history-dialog input').press('Enter');
 await page.waitForFunction(()=>document.querySelector('#thread-list').textContent.includes('Work project'));
 await page.evaluate(()=>{OgleConversationPicker.render();});assert.equal(await page.locator('.compact-project-name').textContent(),'Work project');
 await page.evaluate(()=>historyTest.action='hide');await page.locator('#thread-list .thread-project').click({button:'right'});await page.waitForFunction(()=>!document.querySelector('#thread-list .thread'));
 await page.evaluate(()=>{OgleConversationPicker.render();});assert.equal(await page.locator('.compact-thread').count(),0);
 await page.evaluate(async()=>{historyTest.action='show-hidden';await OgleHistory.open({provider:'codex',kind:'all'});historyTest.action='archive';historyTest.cancelled=true;});
 await page.locator('#thread-list .thread').click({button:'right'});assert.equal(await page.locator('#thread-list .thread').count(),1);
 await page.evaluate(async()=>{historyTest.action='archives';await OgleHistory.open({provider:'codex',kind:'all'});});await page.locator('.history-dialog button').filter({hasText:'Restore'}).click();assert.equal(await page.evaluate(()=>historyTest.restores[0]),'archived');
 await page.evaluate(()=>setMode('reveal'));assert.equal(await page.locator('.history-dialog').count(),0);
 console.log('PASS actual renderer history context menus, rename Enter, project aliases/hiding, cancelled archive, restore and collapse cleanup.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
