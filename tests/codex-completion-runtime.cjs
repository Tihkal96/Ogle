'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');

(async()=>{
  const root=path.resolve(__dirname,'..');
  const profile=path.join(root,'artifacts','codex-completion-'+Date.now());
  fs.mkdirSync(profile,{recursive:true});
  fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,autoCollapse:false,compactChatTarget:'codex',statsClicks:false,statsKeys:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:''}));
  fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'ogle-completion-test',main:'main.cjs'}));
  fs.writeFileSync(path.join(profile,'main.cjs'),`
    const {EventEmitter}=require('node:events');
    const bridgeModule=require(${JSON.stringify(path.join(root,'src/main/codex-bridge.cjs'))});
    bridgeModule.CodexBridge=class extends EventEmitter {
      constructor(){super();global.testBridge=this;}
      async connect(){this.emit('status',{state:'disconnected'});return {};}
      async listThreads(){return {data:[]};}
      close(){}
    };
    require(${JSON.stringify(path.join(root,'src/main/main.cjs'))});
  `);
  execFileSync(process.execPath,['--check',path.join(profile,'main.cjs')],{windowsHide:true});
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[profile],env});
  try {
    const page=await app.firstWindow();page.setDefaultTimeout(15000);
    await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady&&!DockLayoutTransition.busy);
    await app.evaluate(({BrowserWindow,ipcMain,screen})=>{
      const win=BrowserWindow.getAllWindows()[0];win.show();
      screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});
      ipcMain.removeHandler('dock:readThread');
      ipcMain.handle('dock:readThread',(_event,id)=>({thread:{id,turns:[{id:'history',items:[{type:'agentMessage',id:'answer-'+id,text:'Completed answer'}]}]},runtime:{running:false}}));
      ipcMain.removeHandler('dock:listThreads');ipcMain.handle('dock:listThreads',()=>({data:[]}));
    });
    const done=async(threadId,turnId)=>app.evaluate((_electron,{threadId,turnId})=>global.testBridge.emit('activity',{threadId,turnId,running:false,completed:true}),{threadId,turnId});
    const waitSettled=()=>page.waitForFunction(()=>!DockLayoutTransition.busy&&!document.hidden);
    await page.evaluate(async()=>{await switchPanel('chats');await selectThread({id:'selected-task',name:'Selected task'});});
    await waitSettled();
    await done('selected-task','visible-done');
    await page.waitForFunction(()=>completedTurns.has(JSON.stringify(['selected-task','visible-done']))&&!completedTasks.has('selected-task')&&state.petState!=='review');

    await page.evaluate(()=>collapse(true));await waitSettled();
    await done('selected-task','collapsed-done');
    await page.waitForFunction(()=>completedTasks.has('selected-task')&&state.petState==='review');
    await page.evaluate(()=>collapse(false));await waitSettled();
    await page.waitForFunction(()=>!completedTasks.has('selected-task')&&state.petState!=='review');

    await done('other-task','other-done');
    await page.waitForFunction(()=>completedTasks.has('other-task')&&state.petState==='review');
    await done('selected-task','visible-with-other');
    await page.waitForFunction(()=>completedTurns.has(JSON.stringify(['selected-task','visible-with-other']))&&!completedTasks.has('selected-task'));
    assert.equal(await page.evaluate(()=>completedTasks.has('other-task')),true,'Viewing one task must preserve another task completion');
    // Clear the unrelated completion before testing additional visibility states.
    await page.evaluate(()=>acknowledgeCompletion('other-task'));

    await page.evaluate(()=>switchPanel('notes'));await waitSettled();
    await done('selected-task','different-tab-done');
    await page.waitForFunction(()=>completedTasks.has('selected-task')&&state.petState==='review');
    await page.evaluate(()=>switchPanel('chats'));await waitSettled();
    await page.waitForFunction(()=>!completedTasks.has('selected-task'));

    await page.evaluate(()=>api.windowAction('minimize'));
    await page.waitForFunction(()=>state.dockVisible===false,null,{polling:100});
    await done('selected-task','hidden-done');
    await page.waitForFunction(()=>completedTasks.has('selected-task')&&state.petState==='review',null,{polling:100});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
    await waitSettled();
    await page.waitForFunction(()=>!completedTasks.has('selected-task')&&state.petState!=='review');
    console.log('PASS completion acknowledged for visible selected Codex task, late completion and direct re-expansion; other tasks, different tabs and hidden app retain review.');
  } finally {await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
