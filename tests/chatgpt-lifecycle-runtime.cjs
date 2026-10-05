'use strict';
const {_electron}=require('playwright');const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','chatgpt-lifecycle-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,autoCollapse:true,autoCollapseSeconds:7,useCodex:false,useChatGPT:true,useClaude:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.PETDOCK_TEST_EXE;const app=await _electron.launch({...(executablePath?{executablePath,args:[]}:{args:[root]}),env});
 try{
 const page=await app.firstWindow();
 await app.evaluate(({session})=>{global.__gptLifecycleLoads=0;session.fromPartition('persist:petdock-chatgpt').protocol.handle('https',()=>{global.__gptLifecycleLoads++;return new Response('<!doctype html><main><section data-turn-key="fixture"><h4 data-conversation-role="assistant"></h4><button aria-label="Rate response"></button></section></main><form data-chatgpt-composer data-composer-placement="thread"><div role="textbox" contenteditable="true"></div><button aria-label="Stop generating" type="button"></button></form><script>window.framesSeen=0;window.timerSeen=0;const frame=()=>{framesSeen++;requestAnimationFrame(frame)};requestAnimationFrame(frame);setInterval(()=>timerSeen++,100);</script>',{headers:{'content-type':'text/html'}});});});
 await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady&&!DockLayoutTransition.busy,null,{timeout:15000});await page.locator('[data-panel="chatgpt"]').evaluate(n=>n.click());
 let id;for(let i=0;i<40;i++){id=await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL()==='https://chatgpt.com/')?.id);if(id)break;await page.waitForTimeout(100);}assert.ok(id);
 const sample=()=>app.evaluate(async({webContents},id)=>{const w=webContents.fromId(id);return{id:w.id,url:w.getURL(),destroyed:w.isDestroyed(),prefs:w.getBackgroundThrottling(),document:await w.executeJavaScript('({frames:framesSeen,timers:timerSeen,visible:document.visibilityState})'),loads:global.__gptLifecycleLoads};},id);
 await page.waitForTimeout(500);const before=await sample();
 await page.evaluate(()=>setMode('idle'));await page.waitForFunction(()=>state.mode==='idle'&&!DockLayoutTransition.busy);await page.waitForTimeout(8200);const hidden=await sample();
 assert.equal(hidden.id,before.id);assert.equal(hidden.loads,before.loads);assert.equal(hidden.prefs,false);assert.equal(hidden.document.visible,'visible');assert.ok(hidden.document.frames>before.document.frames+60,'animation frames keep progressing while dock is a ball');assert.ok(hidden.document.timers>before.document.timers+40,'page timers keep progressing while dock is a ball');
 await page.locator('[data-panel="chatgpt"]').evaluate(n=>n.click());await page.waitForFunction(()=>state.mode==='expand'&&!DockLayoutTransition.busy);const reopened=await sample();assert.equal(reopened.id,id);assert.equal(reopened.loads,before.loads);
 // A transient main-frame load failure must not hide an already useful page.
 await app.evaluate(({webContents},id)=>webContents.fromId(id).emit('did-fail-load',{},-2,'Fixture transient failure','https://chatgpt.com/',true),id);
 const viewVisible=await app.evaluate(({BrowserWindow},id)=>BrowserWindow.getAllWindows().flatMap(w=>w.contentView.children).find(v=>v.webContents?.id===id)?.getVisible(),id);assert.equal(viewVisible,true);
 console.log(JSON.stringify({passed:true,sameWebContents:true,noIncidentalLoads:true,backgroundThrottling:false,hiddenProgress:{frames:hidden.document.frames-before.document.frames,timers:hidden.document.timers-before.document.timers},visibilityWhileBall:hidden.document.visible,failedPageNotHidden:true,source:'Isolated HTTPS fixture; no real account or prompt.'},null,2));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

