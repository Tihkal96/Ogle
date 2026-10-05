'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{execFileSync}=require('child_process'),{_electron}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','performance-'+Date.now());fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'performance-fixture',main:'main.cjs'}));fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,autoCollapse:false,lastThreadId:'large',compactChatTarget:'codex',shortcutVisibility:'',shortcutPanel:'',shortcutBar:''}));
 fs.writeFileSync(path.join(profile,'main.cjs'),`const {EventEmitter}=require('events');const bridgeModule=require(${JSON.stringify(path.join(root,'src/main/codex-bridge.cjs'))});const project=bridgeModule.desktopThread;
 const raw={id:'large',title:'Large conversation',cwd:'C:/fixture',latestThreadSettings:{model:'fixture-model',effort:'high'},threadRuntimeStatus:{type:'idle'},turns:Array.from({length:5000},(_,i)=>({id:'t'+i,status:'completed',items:[{id:'u'+i,type:'userMessage',text:'Question '+i+' '+'.'.repeat(1000)},{id:'hidden'+i,type:'reasoning',text:'ignored'.repeat(1000)},{id:'a'+i,type:'agentMessage',text:'Answer '+i+' '+'.'.repeat(1000)}]}))};
 bridgeModule.CodexBridge=class extends EventEmitter {constructor(){super();global.fixtureBridge=this;this.modelCalls=0;}async connect(){this.emit('status',{state:'ready'});return {mode:'fixture'};}listThreads(){return {data:[{id:'large',name:'Large conversation',cwd:'C:/fixture'}]};}readThread(id,options={}){return project(raw,options.messageLimit||80);}async listModels(){this.modelCalls++;await new Promise(r=>setTimeout(r,200));return {data:[{model:'fixture-model',supportedReasoningEfforts:[{reasoningEffort:'high'},{reasoningEffort:'low'}]}]};}close(){}accountRead(){return {};}};
 require(${JSON.stringify(path.join(root,'src/main/main.cjs'))});`);
 execFileSync(process.execPath,['--check',path.join(profile,'main.cjs')]);const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({args:[profile],env});try{const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await app.evaluate(({screen})=>{screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
 await page.waitForFunction(()=>typeof state!=="undefined"&&state.bootReady&&state.selected?.id==='large'&&messageView.items.size===80&&!DockLayoutTransition.busy);
 await page.evaluate(()=>{window.firstVisible=[];window.watch=setInterval(()=>{const n=$('messages');if(n.style.visibility!=='hidden'&&n.querySelector('article'))firstVisible.push(n.scrollHeight-n.clientHeight-n.scrollTop);},16);});
 const duration=await page.evaluate(async()=>{const t=performance.now();await switchPanel('chats');return performance.now()-t;});
 await page.waitForFunction(()=>$('messages').getAttribute('aria-busy')==='false');assert.equal(await page.locator('#messages article').count(),80);assert.ok(duration<1000);
 assert.equal(await page.locator('#codex-model').inputValue(),'fixture-model');assert.equal(await page.locator('#codex-effort').inputValue(),'high');
 for(let i=0;i<8;i++)await page.evaluate(async()=>{await switchPanel('notes');await switchPanel('chats');});assert.equal(await app.evaluate(()=>global.fixtureBridge.modelCalls),1,'Tab switches reuse catalog');
 await page.locator('#load-earlier').click();await page.waitForFunction(()=>messageView.items.size===160);assert.equal(await page.locator('#messages article').count(),160);
 assert.equal(await page.locator('#messages article').first().locator('.message-text').textContent(),'Question 4920 '+'.'.repeat(1000));
 const visible=await page.evaluate(()=>{clearInterval(watch);return firstVisible.slice(0,5);});assert.ok(visible.every(distance=>distance<5),JSON.stringify(visible));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({rawMessages:10000,initialDom:80,olderOnDemand:160,openMs:duration,firstVisibleAtBottom:true,modelCatalogCalls:1,desktopSettingsRead:true,errors}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
