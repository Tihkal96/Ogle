'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const html = `<!doctype html><button id="copy">Copy code</button><button id="read">Read</button><script>
copy.onclick=async()=>{try{await navigator.clipboard.writeText('Ogle clipboard fixture');window.result='copied'}catch(e){window.result=e.name}};
read.onclick=async()=>{try{await navigator.clipboard.readText();window.result='read'}catch(e){window.result=e.name}};
</script>`;
if (process.versions.electron) {
  const {app,BrowserWindow,clipboard,ClipboardItem}=require('electron');
  const {ChatGPTPanel}=require('../src/main/chatgpt-panel.cjs');
  app.setPath('userData',process.env.OGLE_CLIPBOARD_FIXTURE);
  app.whenReady().then(async()=>{
    global.savedClipboard=await Promise.all((await clipboard.read()).map(async item=>{const values={};for(const type of item.types)values[type]=await item.getType(type);return new ClipboardItem(values);}));
    const win=new BrowserWindow({width:600,height:400});
    await win.loadURL('about:blank');
    global.panel=new ChatGPTPanel({parent:win});
    panel.ensureView();
    await panel.view.webContents.session.protocol.handle('https',()=>new Response(html,{headers:{'content-type':'text/html'}}));
    await panel.view.webContents.loadURL('https://chatgpt.com/c/fixture');
    panel.layout({visible:true,bounds:{x:0,y:0,width:600,height:400}});
    win.show();win.focus();panel.view.webContents.focus();global.ready=true;
  }).catch(error=>{global.fixtureError=error.stack;});
} else (async()=>{
  const env={...process.env,OGLE_CLIPBOARD_FIXTURE:path.resolve('artifacts',`clipboard-${Date.now()}`)};
  delete env.ELECTRON_RUN_AS_NODE;fs.mkdirSync(env.OGLE_CLIPBOARD_FIXTURE,{recursive:true});
  const app=await require('playwright')._electron.launch({args:[__filename],env});
  try {
    for(let i=0;i<100&&!await app.evaluate(()=>global.ready);i++)await new Promise(r=>setTimeout(r,50));
    assert.equal(await app.evaluate(()=>global.fixtureError||global.ready),true);
    const click=async(id)=>app.evaluate(async(_,{id})=>{
      const wc=global.panel.view.webContents;
      await wc.executeJavaScript('window.result=null');
      await wc.executeJavaScript(`document.getElementById(${JSON.stringify(id)}).click()`,true);
      for(let i=0;i<100;i++){const result=await wc.executeJavaScript('window.result');if(result)return result;await new Promise(r=>setTimeout(r,20));}
      return 'timeout';
    },{id});
    // Prove the old deny-all policy causes the reported failure.
    await app.evaluate(()=>{global.panel.view.webContents.session.setPermissionCheckHandler(()=>false);global.panel.view.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));});
    assert.equal(await click('copy'),'NotAllowedError');
    await app.evaluate(()=>{const p=global.panel,s=p.view.webContents.session;s.setPermissionCheckHandler((w,n,o,d)=>p.allowClipboardWrite(w,n,o,d));s.setPermissionRequestHandler((w,n,cb,d)=>cb(p.allowClipboardWrite(w,n,d.requestingUrl,d)));});
    assert.equal(await click('copy'),'copied');
    assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),'Ogle clipboard fixture');
    assert.equal(await click('read'),'NotAllowedError');
    await app.evaluate(()=>global.panel.parent.webContents.focus());
    assert.equal(await click('copy'),'NotAllowedError');
    await app.evaluate(()=>global.panel.view.webContents.focus());
    assert.equal(await app.evaluate(()=>global.panel.allowClipboardWrite(global.panel.view.webContents,'clipboard-sanitized-write','https://chatgpt.com/',{isMainFrame:false})),false);
    await app.evaluate(()=>global.panel.hide());
    assert.equal(await click('copy'),'NotAllowedError');
    await app.evaluate(async()=>{const p=global.panel;p.layout({visible:true});await p.view.webContents.loadURL('https://example.com/');p.parent.focus();p.view.webContents.focus();});
    assert.equal(await click('copy'),'NotAllowedError');
    console.log('Clipboard: old policy reproduced; trusted copy works; read, unfocused/hidden view, subframes and other origin denied.');
  } finally {
    try { await app.evaluate(async({clipboard})=>{if(global.savedClipboard)await clipboard.write(global.savedClipboard);}); } finally { await app.close(); }
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
