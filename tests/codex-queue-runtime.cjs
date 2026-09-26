'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`queue-${Date.now()}`);
  fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false}));
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
  try {
    const page=await app.firstWindow();
    await app.evaluate(({BrowserWindow,screen,ipcMain})=>{
      const window=BrowserWindow.getAllWindows()[0];window.hide();window.webContents.setBackgroundThrottling(false);screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});
      global.queueFixtureCalls=[];global.queueFixtureFail=false;
      ipcMain.removeHandler('dock:sendTurn');ipcMain.handle('dock:sendTurn',(_event,id,text,images)=>{
        global.queueFixtureCalls.push({id,text,images});if(global.queueFixtureFail)throw new Error('Fixture send failed');
        return {turn:{id:`fixture-turn-${global.queueFixtureCalls.length}`}};
      });
      ipcMain.removeHandler('dock:readThread');ipcMain.handle('dock:readThread',(_event,id)=>({thread:{id,turns:[]},runtime:{running:id==='queue-a',turnId:global.queueFixtureCalls.length?`fixture-turn-${global.queueFixtureCalls.length}`:'initial-turn'}}));
    });
    await page.waitForFunction(()=>typeof codexQueue!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
    await page.evaluate(async()=>{setConnection('ready');await switchPanel('chats');await selectThread({id:'queue-a',name:'Queue A'});});
    await page.locator('#prompt').fill('First captured prompt');
    await page.locator('#composer').evaluate(element=>{
      const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);
      const bytes=Uint8Array.from(atob(canvas.toDataURL().split(',')[1]),c=>c.charCodeAt(0));
      const data=new DataTransfer();data.items.add(new File([bytes],'fixture.png',{type:'image/png'}));
      element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    });
    await page.waitForFunction(()=>PetDockAttachments.hasImages()&&!PetDockAttachments.isBusy());
    assert.equal(await page.locator('#send').isEnabled(),true);assert.match(await page.locator('#send').textContent(),/Queue/);
    await page.locator('#send').evaluate(element=>element.click());
    await page.waitForFunction(()=>codexQueue.list('queue-a').length===1);
    assert.equal(await page.locator('#prompt').inputValue(),'');assert.equal(await page.evaluate(()=>PetDockAttachments.hasImages()),false);
    assert.equal((await app.evaluate(()=>global.queueFixtureCalls)).length,0);
    await page.locator('#prompt').fill('Second captured prompt');await page.locator('#send').evaluate(element=>element.click());
    await page.evaluate(()=>selectThread({id:'queue-b',name:'Queue B'}));await page.locator('#prompt').fill('Different task draft');
    const complete=turnId=>page.evaluate(turnId=>onEvent({type:'codex',method:'turn/completed',params:{threadId:'queue-a',turn:{id:turnId,status:'completed'}}}),turnId);
    await complete('initial-turn');await page.waitForFunction(()=>codexQueue.list('queue-a').length===1);
    let calls=await app.evaluate(()=>global.queueFixtureCalls);assert.equal(calls.length,1);assert.equal(calls[0].id,'queue-a');assert.equal(calls[0].text,'First captured prompt');assert.equal(calls[0].images.length,1);assert.match(calls[0].images[0].url,/^data:image\/png;base64,/);
    assert.equal(await page.locator('#prompt').inputValue(),'Different task draft');
    await page.evaluate(()=>onEvent({type:'codex',method:'turn/started',params:{threadId:'queue-a',turn:{id:'fixture-turn-1'}}}));
    await complete('initial-turn');await page.waitForTimeout(100);assert.equal((await app.evaluate(()=>global.queueFixtureCalls)).length,1,'Duplicate old completion must not release second prompt');
    assert.equal(await page.evaluate(()=>state.running.get('queue-a')),'fixture-turn-1','Stale completion must not mark the current turn idle');
    await complete('fixture-turn-1');await page.waitForFunction(()=>codexQueue.list('queue-a').length===0);assert.equal((await app.evaluate(()=>global.queueFixtureCalls)).length,2);
    await page.evaluate(()=>selectThread({id:'queue-a',name:'Queue A'}));await page.locator('#prompt').fill('Preserve on failure');await page.locator('#send').evaluate(element=>element.click());
    await app.evaluate(()=>{global.queueFixtureFail=true;});await complete('fixture-turn-2');
    await page.waitForFunction(()=>codexQueue.list('queue-a')[0]?.status==='paused');
    assert.match(await page.locator('#codex-queue').textContent(),/Preserve on failure/);assert.equal(await page.locator('#codex-queue').getByText('Retry',{exact:true}).count(),1);
    const failedCount=(await app.evaluate(()=>global.queueFixtureCalls)).length;
    await complete('fixture-turn-2');await page.waitForTimeout(100);assert.equal((await app.evaluate(()=>global.queueFixtureCalls)).length,failedCount,'Failure must not auto retry');
    await page.locator('#codex-queue').getByText('Remove',{exact:true}).evaluate(element=>element.click());assert.equal(await page.evaluate(()=>codexQueue.list('queue-a').length),0);
    console.log(JSON.stringify({busySubmitEnabled:true,capturedTaskTextImage:true,draftsIndependent:true,oneSendPerCompletion:true,duplicateCompletionIgnored:true,failurePreserved:true,removeWorks:true,liveMessagesSent:false}));
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
