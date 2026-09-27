'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts',`readiness-commands-${Date.now()}`);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}}).loadFile(${JSON.stringify(path.join(dir,'fixture.html'))}));`);
 const url=file=>'file:///'+path.join(root,'src/renderer',file).replaceAll('\\','/');
 fs.writeFileSync(path.join(dir,'fixture.html'),`<link rel="stylesheet" href="${url('commands.css')}"><button id="origin">Origin</button><script src="${url('commands.js')}"></script><script>window.runs=[];window.events=[];window.commands=[{id:'notes',label:'Open notes',hint:'Write',run:()=>runs.push('notes')},{id:'shell',label:'Open terminal',hint:'Shell',run:()=>{if(OgleCommands.isOpen())throw Error('still open');runs.push('shell');}}];OgleCommands.mount({commands:()=>commands,beforeOpen:async()=>events.push('before'),visibility:value=>events.push(value)});</script>`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const app=await electron.launch({args:[path.join(dir,'main.cjs')],env});
 try{
 const page=await app.firstWindow();await page.locator('#origin').focus();await page.keyboard.press('Control+Shift+p');const input=page.getByRole('combobox');await input.waitFor();assert.equal(await input.evaluate(n=>n===document.activeElement),true);
 await input.fill('shell');assert.equal(await page.getByRole('option').count(),1);await input.press('Enter');assert.deepEqual(await page.evaluate(()=>runs),['shell']);assert.equal(await page.evaluate(()=>OgleCommands.isOpen()),false);assert.deepEqual(await page.evaluate(()=>events),['before',true,false]);
 await page.locator('#origin').focus();await page.keyboard.press('Control+Shift+p');await input.press('ArrowUp');assert.equal(await page.getByRole('option',{selected:true}).innerText(),'Open terminal\nShell');await input.press('ArrowDown');assert.equal(await page.getByRole('option',{selected:true}).innerText(),'Open notes\nWrite');await input.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'origin');assert.deepEqual(await page.evaluate(()=>runs),['shell']);
 await page.keyboard.press('Control+Shift+p');await input.fill('missing');assert.equal(await page.getByRole('option').count(),0);assert.equal(await page.locator('footer').textContent(),'No matching commands');await input.press('Enter');assert.equal(await page.evaluate(()=>OgleCommands.isOpen()),true);await page.getByRole('button',{name:'Close commands'}).click();assert.equal(await page.evaluate(()=>document.activeElement.id),'origin');
 console.log('PASS palette shortcut, filtering hints, single action after close, arrows, escape focus, empty results');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
