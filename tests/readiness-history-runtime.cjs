'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`history-race-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,compactChatTarget:'codex'}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try {
 const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady);
 await app.evaluate(({ipcMain})=>{
  global.historyDeferred=false;global.historyResolve=null;
  ipcMain.removeHandler('dock:readThread');ipcMain.handle('dock:readThread',(_event,id)=>{
   const snapshot={thread:{id,turns:[{id:'old-turn',status:'completed',items:[{id:'answer',type:'agentMessage',text:'old snapshot'}]}]}};
   return global.historyDeferred?new Promise(resolve=>{global.historyResolve=()=>resolve(snapshot);}):snapshot;
  });
 });
 await page.evaluate(async()=>{state.connected=false;await selectThread({id:'history-race',name:'History race'});state.connected=true;state.mode='expand';state.activePanel='chats';});
 const stream=()=>page.evaluate(()=>{
  for(const event of [
   {method:'turn/started',params:{threadId:'history-race',turn:{id:'new-turn'}}},
   {method:'item/agentMessage/delta',params:{threadId:'history-race',itemId:'answer',delta:' new output'}},
   {method:'item/completed',params:{threadId:'history-race',item:{id:'answer',type:'agentMessage',text:'new completed response'}}},
   {method:'turn/completed',params:{threadId:'history-race',turn:{id:'new-turn',status:'completed'}}}
  ])onEvent({type:'codex',...event});
 });
 await app.evaluate(()=>{global.historyDeferred=true;});
 await page.evaluate(()=>{window.historyRequest=refreshSelectedHistory();});
 await app.evaluate(async()=>{while(!global.historyResolve)await new Promise(resolve=>setTimeout(resolve,10));});
 await stream();await app.evaluate(()=>{global.historyResolve();global.historyResolve=null;});await page.evaluate(()=>window.historyRequest);
 assert.equal(await page.evaluate(()=>messageView.text('answer')),'new completed response','late idle history must not overwrite a completed turn');
 await page.evaluate(()=>{window.selectionRequest=selectThread({id:'history-race',name:'History race'});});
 await app.evaluate(async()=>{while(!global.historyResolve)await new Promise(resolve=>setTimeout(resolve,10));});
 await stream();await app.evaluate(()=>{global.historyResolve();global.historyResolve=null;});await page.evaluate(()=>window.selectionRequest);
 assert.equal(await page.evaluate(()=>messageView.text('answer')),'new completed response','late initial selection history must not overwrite streaming events');
 console.log('Deferred history snapshots cannot overwrite newer events during refresh or initial selection.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
