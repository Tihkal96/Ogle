'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`responsive-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
 await page.waitForFunction(()=>typeof messageView!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
 await page.evaluate(()=>switchPanel('notes'));
 const result=await page.evaluate(()=>{messageView.reset();state.selected={id:'fixture',name:'Fixture'};const items=Array.from({length:800},(_,i)=>({id:'m'+i,type:i%2?'agentMessage':'userMessage',text:'Message '+i+' '+'.'.repeat(1000)}));items.push({id:'thinking',type:'reasoning',text:'x'.repeat(1000000)});const start=performance.now();desktopThread({thread:{id:'fixture',turns:[{id:'t',status:'inProgress',items}]},runtime:{running:true}});return {time:performance.now()-start,dom:state.messages.size,pending:messageView.pending.size};});
 assert.equal(result.dom,0,'Hidden conversation must not build DOM');assert.equal(result.pending,800);assert.ok(result.time<500);
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],original=w.setOpacity.bind(w);global.opacityCalls=[];w.setOpacity=value=>{global.opacityCalls.push(value);return original(value);};});
 const switchMs=await page.evaluate(async()=>{const start=performance.now();await switchPanel('chats');return performance.now()-start;});assert.ok(switchMs<1000,'Switching tabs must not block on history');
 assert.ok((await app.evaluate(()=>global.opacityCalls)).every(value=>value===1),'Same-size tab switch must not hide the window');
 await page.waitForFunction(()=>messageView.pending.size===0,{},{timeout:10000});assert.equal(await page.locator('#messages article').count(),800);assert.equal(await page.locator('#messages').getByText('thinking',{exact:true}).count(),0);
 const burst=await page.evaluate(async()=>{let writes=0;const observer=new MutationObserver(records=>writes+=records.length);observer.observe($('messages'),{childList:true,subtree:true});for(let i=0;i<1000;i++)onEvent({type:'codex',method:'item/agentMessage/delta',params:{threadId:'fixture',itemId:'answer',delta:'x'}});await new Promise(r=>setTimeout(r,180));observer.disconnect();return {writes,text:messageView.text('answer'),rendered:state.messages.get('answer')?.lastChild.textContent};});assert.equal(burst.text.length,1000);assert.equal(burst.rendered.length,1000);assert.ok(burst.writes<10,'Burst must update DOM once instead of per token');
 await page.evaluate(()=>{window.__beforeReason=messageView.items.size;onEvent({type:'codex',method:'item/reasoning/textDelta',params:{delta:'hidden thought'}});});assert.equal(await page.evaluate(()=>messageView.items.size===window.__beforeReason),true);
 await app.evaluate(({ipcMain,BrowserWindow})=>{ipcMain.removeHandler('dock:sendTurn');ipcMain.handle('dock:sendTurn',(_e,id,text)=>{BrowserWindow.getAllWindows()[0].webContents.send('dock:event',{type:'codex',method:'item/completed',params:{threadId:id,item:{id:'authoritative-user',type:'userMessage',text}}});return {turn:{id:'fixture-turn'}};});});
 await page.evaluate(()=>{state.connected=true;state.running.clear();$('prompt').value='Queued message fixture';updateComposer();$('composer').requestSubmit();});
 await page.waitForFunction(()=>messageView.items.has('authoritative-user'));await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>[...messageView.items.values()].filter(item=>item.role==='user'&&item.text==='Queued message fixture').length),1,'Deferred authoritative echo must not create an optimistic duplicate');
 console.log(JSON.stringify({optimisticEchoDeduplicated:true,hiddenHistoryDeferred:true,historyMessages:800,loadEnqueueMs:result.time,panelSwitchMs:switchMs,sameSizeNeverHidden:true,burstDomMutations:burst.writes,reasoningIgnored:true}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
