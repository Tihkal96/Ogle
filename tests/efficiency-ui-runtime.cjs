'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','efficiency-ui-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({assistantsConfigured:true,useCodex:true,useChatGPT:false,useClaude:false,useClaudeWeb:false,lastThreadId:'fixture',autoStart:false,autoCollapse:false,autoExpand:false,compactChatTarget:'codex',statsClicks:false,statsKeys:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:''}));
 fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'ogle-efficiency-test',main:'main.cjs'}));
 fs.writeFileSync(path.join(profile,'main.cjs'),`
 const {EventEmitter}=require('node:events');global.historyCalls=[];global.listCalls=0;global.runtimeCalls=0;
 require(${JSON.stringify(path.join(root,'src/main/codex-bridge.cjs'))}).CodexBridge=class extends EventEmitter{
 constructor(){super();global.testBridge=this;this.ready=new Promise(resolve=>{global.finishConnect=()=>{clearTimeout(this.timer);this.emit('status',{state:'connected'});resolve({});};this.timer=setTimeout(global.finishConnect,20000);});}
 connect(){return this.ready;}
 async listThreads(){global.listCalls++;return {data:[{id:'fixture',name:'Fixture task',cwd:'C:/fixture',updatedAt:1}]};}
 async listModels(){return {data:[]};}async readRuntime(){global.runtimeCalls++;return {runtime:{running:false}};}
 async readThread(id,options){global.historyCalls.push({id,options});const earlier=options.historyCursor==='opaque-older',start=earlier?0:80;return {thread:{id,name:'Fixture task',cwd:'C:/fixture',updatedAt:1,turns:[{id:'turn',status:'completed',items:Array.from({length:80},(_,index)=>({id:String(start+index),type:(start+index)%2?'agentMessage':'userMessage',text:'Message '+(start+index)}))}],history:{incremental:true,nextCursor:earlier?null:'opaque-older',hasMore:!earlier,loadedMessages:80}},runtime:{running:false}};}
 close(){clearTimeout(this.timer);} };
 require(${JSON.stringify(path.join(root,'src/main/main.cjs'))});`);
 execFileSync(process.execPath,['--check',path.join(profile,'main.cjs')]);const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const started=Date.now(),app=await electron.launch({args:[profile],env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady&&!DockLayoutTransition.busy);
  const bootMs=Date.now()-started;assert.ok(bootMs<12000,'boot must not wait for the 20-second Codex connection');assert.equal(await app.evaluate(()=>global.historyCalls.length),0);
  await app.evaluate(()=>global.finishConnect());await page.waitForFunction(()=>state.connected);await page.evaluate(()=>backgroundWork.tick());assert.equal(await page.evaluate(()=>state.selected.id),'fixture');assert.equal(await app.evaluate(()=>global.historyCalls.length),0,'ball selection reads metadata only');
  await page.evaluate(()=>switchPanel('chats'));await page.waitForFunction(()=>messageView.items.size===80);assert.equal(await app.evaluate(()=>global.historyCalls.length),1);assert.equal(await app.evaluate(()=>global.historyCalls[0].options.messageLimit),80);
  await app.evaluate(()=>global.testBridge.emit('notification',{method:'petdock/threadState',params:{partial:true,thread:{id:'fixture',turns:[{id:'live',status:'inProgress',items:[{id:'160',type:'agentMessage',text:'Stream update'}]}]},runtime:{running:true,turnId:'live'}}}));await page.waitForFunction(()=>messageView.text('160')==='Stream update');
  await page.locator('#load-earlier').click();await page.waitForFunction(()=>messageView.items.size===161);const calls=await app.evaluate(()=>global.historyCalls);assert.equal(calls[1].options.messageLimit,80);assert.equal(calls[1].options.historyCursor,'opaque-older');
  const ids=await page.evaluate(()=>[...messageView.items.keys()].map(Number).sort((a,b)=>a-b));assert.deepEqual(ids,Array.from({length:161},(_,index)=>index));
  await page.evaluate(async()=>{state.running.clear();await switchPanel('notes');await switchPanel('chats');});assert.equal(await app.evaluate(()=>global.historyCalls.length),2,'unchanged quiet chat does not download history again');
  const before=await app.evaluate(()=>global.listCalls);await page.evaluate(()=>{state.settings.useCodex=false;applySettings();backgroundWork.wake();});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>backgroundWork.timer),null,'disabled provider has no background timer');assert.equal(await app.evaluate(()=>global.listCalls),before);
  console.log(JSON.stringify({passed:true,bootMs,delayedConnectionMs:20000,ballHistoryReads:0,initialMessages:80,earlierBatch:80,streamedMessagePreserved:true,quietReopenExtraReads:0,disabledBackground:true}));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
