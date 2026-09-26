'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'..'), profile=path.join(root,'artifacts',`chatgpt-controls-profile-${Date.now()}`);
  fs.mkdirSync(profile,{recursive:true});
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[root],env});
  try{
    const page=await app.firstWindow();
    await app.evaluate(({session,dialog})=>{
      const isolated=session.fromPartition('persist:petdock-chatgpt');
      isolated.protocol.handle('https',()=>new Response('<!doctype html><html><body style="margin:0"><main id="conversation" style="height:220px;overflow-y:auto"><article data-message-id="first" style="height:1200px">First message</article><article data-message-id="last" style="height:50px">Last message</article></main></body></html>',{headers:{'content-type':'text/html'}}));
      global.__controlsChecks={dialogs:[],clearCalls:0};
      dialog.showMessageBox=async(_parent,options)=>{global.__controlsChecks.dialogs.push(options);return{response:0};};
      isolated.clearStorageData=async()=>{global.__controlsChecks.clearCalls++;throw new Error('Unexpected clear on cancelled logout');};
    });
    await page.locator('#settings-panel .settings-actions').first().waitFor({state:'attached',timeout:60000});
    await page.locator('[data-panel="chatgpt"]').evaluate(el=>el.click());
    await page.locator('#settings-button').evaluate(el=>el.click());
    await page.getByRole('button',{name:'ChatGPT / sign in',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('chatgpt-panel').hidden);
    let remote;
    for(let i=0;i<30;i++){
      remote=await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://chatgpt.com/'))?.id);
      if(remote)break;
      await page.waitForTimeout(100);
    }
    assert.ok(remote,'Settings sign-in button opens embedded ChatGPT');
    const scrollState=()=>app.evaluate(async({webContents},id)=>webContents.fromId(id).executeJavaScript('({top:document.querySelector("#conversation").scrollTop,max:document.querySelector("#conversation").scrollHeight-document.querySelector("#conversation").clientHeight})'),remote);
    await page.waitForTimeout(100);
    assert.equal((await scrollState()).top,0);
    await page.locator('[data-chatgpt-action="bottom"]').click();
    await page.waitForTimeout(900);
    const bottom=await scrollState();
    assert.ok(bottom.max>0 && bottom.top>=bottom.max-1,'Latest scrolls a conversation container to its last message');
    await page.locator('#settings-button').evaluate(el=>el.click());
    await page.getByRole('button',{name:'Sign out of ChatGPT',exact:true}).click();
    await page.waitForTimeout(150);
    const checks=await app.evaluate(({webContents},id)=>({...global.__controlsChecks,url:webContents.fromId(id).getURL()}),remote);
    assert.equal(checks.dialogs.length,1);
    assert.deepEqual(checks.dialogs[0].buttons,['Cancel','Sign out']);
    assert.equal(checks.dialogs[0].defaultId,0);
    assert.equal(checks.clearCalls,0);
    assert.equal(checks.url,'https://chatgpt.com/');
    assert.equal((await scrollState()).top,bottom.top,'Cancel preserves the loaded page');
    const report={at:new Date().toISOString(),profile,fixture:'Controlled HTTPS conversation in isolated partition; no account login',settingsSignInRoutesToTab:true,latestScroll:bottom,logoutCancelPreservedPage:true,storageClearCalls:0};
    fs.writeFileSync(path.join(root,'artifacts/chatgpt-controls-runtime.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
