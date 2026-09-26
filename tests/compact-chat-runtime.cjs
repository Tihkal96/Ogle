'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const fixture=`<!doctype html><form><textarea id="prompt-textarea"></textarea><input type="file" multiple><div id="files"></div><button type="button" data-testid="send-button" disabled>Send</button></form><script>
const prompt=document.querySelector('textarea'),send=document.querySelector('button'),files=document.querySelector('#files');window.sent=[];
prompt.addEventListener('input',()=>send.disabled=!prompt.value.trim()&&!files.children.length);
document.querySelector('input').addEventListener('change',e=>{for(const file of e.target.files){const node=document.createElement('div');node.dataset.testid='attachment';node.textContent=file.name;files.append(node);}send.disabled=false;});
send.onclick=()=>{window.sent.push({text:prompt.value,files:[...files.children].map(n=>n.textContent)});const clear=()=>{prompt.value='';files.replaceChildren();window.completeSend=null;};if(window.holdSend)window.completeSend=clear;else clear();};
</script>`;
(async()=>{
  const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`compact-chat-profile-${Date.now()}`);
  fs.mkdirSync(profile,{recursive:true});
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const executable=process.env.PETDOCK_TEST_EXE;
  const launch=()=>electron.launch({...(executable?{executablePath:executable,args:[]}:{args:[root]}),env});
  let app=await launch();
  try {
    let page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await app.evaluate(async({session,screen},html)=>{
      screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});
      await session.fromPartition('persist:petdock-chatgpt').protocol.handle('https',()=>new Response(html,{headers:{'content-type':'text/html'}}));
    },fixture);
    await page.locator('#compact-chat-choice').waitFor({state:'visible',timeout:60000});
    await page.locator('[data-compact-choice="chatgpt"]').click();
    const settled=()=>page.waitForFunction(()=>!DockLayoutTransition.busy);
    await page.waitForFunction(()=>state.settings.compactChatTarget==='chatgpt');await settled();
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'settings.json'))).compactChatTarget,'chatgpt');
    await page.evaluate(()=>setMode('reveal'));
    assert.equal(await page.locator('#conversation-picker-toggle').isHidden(),true);
    await page.locator('#conversation-name').evaluate(el=>el.click());await settled();
    await page.locator('#prompt').fill('Read my attached note');
    await page.locator('#composer').evaluate(el=>{const data=new DataTransfer();data.items.add(new File(['hello'],'note.txt',{type:'text/plain'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
    await page.waitForFunction(()=>PetDockAttachments.hasImages()&&!PetDockAttachments.isBusy());
    await page.locator('#send').click();
    await page.waitForFunction(()=>state.mode==='expand'&&state.activePanel==='chatgpt'&&!state.chatgptSending);await settled();
    const sent=await app.evaluate(async({webContents})=>{const remote=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://chatgpt.com/'));return remote.executeJavaScript('window.sent');});
    assert.deepEqual(sent,[{text:'Read my attached note',files:['note.txt']}]);
    assert.equal(await page.evaluate(()=>state.settings.drafts.__chatgpt__),'');
    const remoteEval=script=>app.evaluate(async({webContents},script)=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://chatgpt.com/')).executeJavaScript(script),script);
    for(const edited of [false,true]) {
      await remoteEval('window.holdSend=true');
      await page.evaluate(()=>setMode('quick'));
      await page.locator('#prompt').fill('Pending followup');await page.locator('#send').click();
      for(let i=0;i<50 && !await remoteEval('!!window.completeSend');i++)await page.waitForTimeout(50);
      assert.equal(await remoteEval('!!window.completeSend'),true);
      await page.evaluate(()=>setMode('quick'));
      if(edited)await page.locator('#prompt').fill('New draft typed while sending');
      await remoteEval('window.completeSend()');
      await page.waitForFunction(()=>!state.chatgptSending);
      assert.equal(await page.locator('#prompt').inputValue(),edited?'New draft typed while sending':'');
    }
    await page.evaluate(()=>setMode('quick'));
    await page.locator('#prompt').fill('Keep this ChatGPT draft');
    await page.evaluate(()=>setMode('expand'));
    await page.evaluate(()=>setMode('quick'));
    assert.equal(await page.locator('#prompt').inputValue(),'Keep this ChatGPT draft');
    await page.evaluate(()=>switchPanel('settings'));
    await page.locator('[data-setting="compactChatTarget"]').selectOption('codex');
    await page.waitForFunction(()=>typeof state!=='undefined' && state.settings.compactChatTarget==='codex');
    await page.evaluate(()=>setMode('reveal'));
    assert.equal(await page.locator('#conversation-picker-toggle').isVisible(),true);
    assert.deepEqual(errors,[]);
    await app.close();app=await launch();page=await app.firstWindow();
    await page.waitForFunction(()=>typeof state!=='undefined' && state.settings.compactChatTarget==='codex');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#compact-chat-choice').count(),0);
    console.log(JSON.stringify({firstStartupChoice:true,choicePersisted:true,chatgptHidesPicker:true,textAndFileSent:true,fullChatGPTOpened:true,draftPreserved:true,pendingSendEditsPreserved:true,codexSwitchRestoresPicker:true,noRepeatPrompt:true,liveAccountUsed:false}));
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
