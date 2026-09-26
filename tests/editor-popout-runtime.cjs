'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`editor-popout-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
 await page.waitForFunction(()=>typeof state!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
 await page.evaluate(()=>switchPanel('editor'));
 const content=page.locator('.cm-content');await content.click();await page.keyboard.insertText('alpha beta alpha');await page.keyboard.press('Control+f');
 const dialog=page.getByRole('dialog',{name:'Find and replace'});await dialog.waitFor();
 const geometry=await dialog.evaluate(el=>({position:getComputedStyle(el.parentElement).position,inputHeight:el.querySelector('[name=search]').getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)}));
 assert.equal(geometry.position,'absolute');assert.ok(geometry.inputHeight>=28);assert.ok(geometry.font>=12);
 await dialog.locator('input[name=search]').fill('alpha');await dialog.getByRole('button',{name:'Next match',exact:true}).click();
 await dialog.locator('input[name=replace]').fill('gamma');await dialog.getByRole('button',{name:'Replace all matches',exact:true}).click();assert.equal(await content.innerText(),'gamma beta gamma');
 await page.screenshot({path:path.join(root,'artifacts/editor-find-popout.png')});
 await page.evaluate(()=>setMode('reveal'));await dialog.waitFor({state:'detached'});
 await page.evaluate(()=>switchPanel('editor'));await content.click();await page.keyboard.press('Control+f');await dialog.waitFor();
 // Both manual and timeout collapse enter this same collapsed state.
 await page.evaluate(()=>setMode('idle'));await dialog.waitFor({state:'detached'});
 await page.evaluate(()=>switchPanel('editor'));await content.click();await page.keyboard.press('Control+f');await dialog.waitFor();await page.evaluate(()=>switchPanel('terminal'));await dialog.waitFor({state:'detached'});
 assert.equal(await page.getByRole('button',{name:'New administrator PowerShell',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'Clear screen',exact:true}).count(),1);
 await page.screenshot({path:path.join(root,'artifacts/compact-shell.png')});
 console.log('Readable floating find/replace, functional replacement, collapse/panel dismissal and accessible shell controls passed');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
