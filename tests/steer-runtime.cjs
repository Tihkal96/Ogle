'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`steer-${Date.now()}`);
 fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();
  await app.evaluate(({BrowserWindow,screen,ipcMain})=>{
   const win=BrowserWindow.getAllWindows()[0];win.hide();win.webContents.setBackgroundThrottling(false);screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});
   global.steerCalls=[];global.sendCalls=[];global.steerFail=false;
   ipcMain.removeHandler('dock:steerTurn');ipcMain.handle('dock:steerTurn',async(_e,id,text,images,turnId)=>{
    global.steerCalls.push({id,text,images,turnId});await new Promise(resolve=>setTimeout(resolve,100));
    if(global.steerFail)throw new Error('Fixture steering failure');return {turnId:'active-fixture'};
   });
   ipcMain.removeHandler('dock:sendTurn');ipcMain.handle('dock:sendTurn',(_e,...args)=>{global.sendCalls.push(args);return {turn:{id:'queued-fixture'}};});
   ipcMain.removeHandler('dock:readThread');ipcMain.handle('dock:readThread',(_e,id)=>({thread:{id,turns:[]},runtime:{running:true,turnId:'active-fixture'}}));
  });
  await page.waitForFunction(()=>typeof codexQueue!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
  await page.evaluate(async()=>{setConnection('ready');await switchPanel('chats');await selectThread({id:'steer-fixture',name:'Steer fixture'});});
  await page.locator('#prompt').fill('Change direction');assert.equal(await page.locator('#steer').isEnabled(),true);
  await page.locator('#steer').click();await page.waitForFunction(()=>state.steering);assert.equal(await page.locator('#steer').isDisabled(),true);
  await page.waitForFunction(()=>!state.steering);assert.equal(await page.locator('#prompt').inputValue(),'');
  assert.deepEqual(await app.evaluate(()=>global.steerCalls),[{id:'steer-fixture',text:'Change direction',images:[],turnId:'active-fixture'}]);
  assert.equal(await page.evaluate(()=>codexQueue.list().length),0);assert.equal((await app.evaluate(()=>global.sendCalls)).length,0);
  await page.locator('#prompt').fill('Queue this separately');await page.locator('#send').click();
  await page.waitForFunction(()=>codexQueue.list().length===1);assert.equal((await app.evaluate(()=>global.steerCalls)).length,1);assert.equal((await app.evaluate(()=>global.sendCalls)).length,0);
  await app.evaluate(()=>{global.steerFail=true;});await page.locator('#prompt').fill('Keep this draft on failure');await page.locator('#steer').click();
  await page.waitForFunction(()=>!state.steering);assert.equal(await page.locator('#prompt').inputValue(),'Keep this draft on failure');
  assert.equal((await app.evaluate(()=>global.steerCalls)).length,2);assert.equal(await page.evaluate(()=>codexQueue.list().length),1);
  console.log(JSON.stringify({steerOnce:true,expectedTurnId:true,queueSeparate:true,failureRetainsDraft:true,liveMessagesSent:false}));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
