'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`scroll-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen,ipcMain})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});ipcMain.removeHandler('dock:readThread');ipcMain.handle('dock:readThread',(_e,id)=>({thread:{id,turns:[{id:'t',items:Array.from({length:160},(_,i)=>({id:id+i,type:i%2?'agentMessage':'userMessage',text:('Message '+i+' with several lines of text.\n').repeat(8)}))}]},runtime:{running:false}}));});
 await page.waitForFunction(()=>typeof messageView!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
 await page.evaluate(async()=>{await switchPanel('chats');await selectThread({id:'scroll-a',name:'A'});});
 const finished=()=>page.waitForFunction(()=>messageView.pending.size===0&&state.messages.size===160);
 await finished();await page.waitForTimeout(250);
 const measure=()=>page.evaluate(()=>({top:$('messages').scrollTop,max:$('messages').scrollHeight-$('messages').clientHeight}));
 let metrics=await measure();assert.ok(metrics.max-metrics.top<5,JSON.stringify({firstOpen:metrics}));
 assert.equal(await page.locator('#go-bottom').isVisible(),false,'Latest arrow is hidden at bottom');
 await page.evaluate(()=>OglePanelView.zoom('chats',1.1));await page.waitForTimeout(200);metrics=await measure();assert.ok(metrics.max-metrics.top<5,'Zoom keeps bottom-following chat at bottom');
 await page.evaluate(()=>OglePanelView.zoom('chats',1,true));await page.waitForTimeout(200);
 await page.evaluate(()=>{$('messages').style.paddingBottom='350px';});await page.waitForTimeout(250);metrics=await measure();assert.ok(metrics.max-metrics.top<5,'Late layout growth follows bottom');
 await page.evaluate(async()=>{await switchPanel('notes');addMessage('hidden-stream','assistant','A later answer\n'.repeat(80));await switchPanel('chats');});await page.waitForTimeout(300);metrics=await measure();assert.ok(metrics.max-metrics.top<5,'Returning to a tab previously at bottom follows new content');
 await page.evaluate(()=>{$('messages').style.paddingBottom='';});await page.waitForTimeout(150);
 await page.evaluate(()=>{const node=$('messages');node.dispatchEvent(new WheelEvent('wheel',{deltaY:-200}));node.scrollTop=1000;});await page.waitForTimeout(150);const saved=(await measure()).top;await page.evaluate(()=>OglePanelView.zoom('chats',1.1));await page.waitForTimeout(200);assert.ok(Math.abs((await measure()).top-saved)<5,'Zoom preserves scrolled-up reading position');await page.evaluate(()=>OglePanelView.zoom('chats',1,true));await page.waitForTimeout(200);assert.equal(await page.locator('#go-bottom').isVisible(),true,'Latest arrow appears above bottom');
 await page.evaluate(()=>selectThread({id:'scroll-b',name:'B'}));await finished();await page.waitForTimeout(150);metrics=await measure();assert.ok(metrics.max-metrics.top<5);
 await page.evaluate(()=>selectThread({id:'scroll-a',name:'A'}));await finished();await page.waitForTimeout(250);metrics=await measure();assert.ok(Math.abs(metrics.top-saved)<5,JSON.stringify({saved,restored:metrics}));
 await page.evaluate(async()=>{await switchPanel('notes');await switchPanel('chats');});await page.waitForTimeout(200);assert.ok(Math.abs((await measure()).top-saved)<5,'Tab switch preserves reading position');
 await page.evaluate(async()=>{await setMode('reveal');await setMode('expand');});await page.waitForTimeout(200);assert.ok(Math.abs((await measure()).top-saved)<5,'Collapse and expansion preserve reading position');
 await page.evaluate(()=>{for(let i=0;i<100;i++)addMessage('stream','assistant','stream '+i);});await page.waitForTimeout(200);assert.ok(Math.abs((await measure()).top-saved)<5,'Streaming must not pull the reader down');
 await page.evaluate(async()=>{await switchPanel('notes');await selectThread({id:'scroll-c',name:'C'});});assert.equal(await page.evaluate(()=>state.messages.size),0);
 await page.evaluate(()=>switchPanel('chats'));await finished();await page.waitForTimeout(250);metrics=await measure();assert.ok(metrics.max-metrics.top<5,JSON.stringify({hiddenFirstOpen:metrics}));
 await page.evaluate(()=>{receiveVisualActivity=()=>{};visualActivity.clear();completedTasks.clear();state.running.clear();state.chatgptWorking=false;state.petHovered=false;state.pendingReaction=null;state.reactionUntil=0;state.attention?.clear();updatePetState();idleAnimation.mode='idle';idleAnimation.reset(performance.now()-60001);});
 await page.waitForFunction(()=>idleAnimation.active&&['waving','review'].includes(canvas.dataset.state));
 await page.evaluate(()=>{idleAnimation.active.until=performance.now()-1;});await page.waitForFunction(()=>!idleAnimation.active&&canvas.dataset.state==='idle');
 assert.ok(await page.evaluate(()=>performance.now()-idleAnimation.since<1000));
 await page.evaluate(()=>{idleAnimation.reset(performance.now()-60001);});await page.waitForFunction(()=>!!idleAnimation.active);
 await page.evaluate(()=>{state.running.set('busy-fixture','turn');updatePetState();});await page.waitForFunction(()=>!idleAnimation.active&&canvas.dataset.state==='running');
 console.log(JSON.stringify({idleFlourishCycle:true,workInterruptsFlourish:true,tabAndCollapsePreserveScroll:true,firstOpenBottom:true,perTaskScrollRestored:true,streamPreservesPosition:true,hiddenLoadBottom:true}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
