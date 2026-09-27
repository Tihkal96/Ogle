'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`readiness-stream-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:''}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
  await page.evaluate(async()=>{await switchPanel('chats');state.selected={id:'stream-fixture',name:'Stream fixture'};messageView.select(state.selected.id);state.connected=true;state.running.set(state.selected.id,'turn-fixture');updateComposer();});
  const result=await page.evaluate(async()=>{
   let mutations=0;const observer=new MutationObserver(records=>mutations+=records.length);observer.observe($('composer'),{subtree:true,attributes:true,childList:true,characterData:true});
   const start=performance.now();for(let i=0;i<1000;i++)onEvent({type:'codex',method:'item/agentMessage/delta',params:{threadId:'stream-fixture',itemId:'answer',delta:'x'}});const elapsed=performance.now()-start;
   await new Promise(resolve=>setTimeout(resolve,200));observer.disconnect();return {elapsed,mutations,text:messageView.text('answer'),rendered:state.messages.get('answer')?.lastChild.textContent};
  });
  console.log(JSON.stringify(result,(key,value)=>key==='text'||key==='rendered'?value?.length:value));assert.equal(result.text.length,1000);assert.equal(result.rendered.length,1000);assert.ok(result.mutations<10,'Streaming tokens must not rebuild unchanged composer controls');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
