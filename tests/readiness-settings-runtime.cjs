'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),fixture=path.join(root,'artifacts',`settings-nav-${Date.now()}`);fs.mkdirSync(fixture,{recursive:true});
 fs.writeFileSync(path.join(fixture,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({show:false,webPreferences:{contextIsolation:true}});w.loadURL('about:blank');});`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[path.join(fixture,'main.cjs')],env});
 try {
 const page=await app.firstWindow();await page.setContent('<main id="settings"></main>');
 for(const name of ['styles.css','settings-navigation.css'])await page.addStyleTag({path:path.join(root,'src/renderer',name)});
 for(const name of ['settings-navigation.js','settings.js'])await page.addScriptTag({path:path.join(root,'src/renderer',name)});
 await page.evaluate(()=>{
 window.OgleDiagnostics={record(){},open(){}};window.saved=[];
 const api=new Proxy({codexAccount:async()=>null,terminalAdminStatus:async()=>({available:false})},{get:(o,k)=>o[k]||(()=>{throw new Error('Unexpected API: '+k);})});
 PetDockSettings.mount(document.querySelector('#settings'),api,{autoCollapseDelay:7000},[],p=>saved.push(p),()=>{},e=>{throw e;},async()=>[],()=>{});
 });
 const search=page.getByRole('searchbox',{name:'Search settings'}),sections=page.locator('.settings-section'),count=await sections.count();
 assert.equal(await page.locator('.settings-section:visible').count(),count);const controls=await page.locator('[data-setting]').count();
 await search.fill('collapse delay');assert.equal(await page.locator('.settings-section:visible h2').innerText(),'Dock behavior');
 assert.equal(await page.locator('[data-setting="autoCollapseDelay"]').inputValue(),'7');
 await search.fill('no-such-setting-989');await page.getByRole('status').filter({hasText:'No settings found'}).waitFor();assert.equal(await page.locator('.settings-section:visible').count(),0);
 await search.press('Escape');assert.equal(await search.inputValue(),'');assert.equal(await page.locator('.settings-section:visible').count(),count);
 await page.getByRole('combobox',{name:'Jump to settings section'}).selectOption({label:'Keyboard shortcuts'});assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Keyboard shortcuts');
 await search.fill('pet size');assert.equal(await page.locator('.settings-section:visible h2').innerText(),'Pet');await page.getByRole('button',{name:'Clear settings search'}).click();
 assert.equal(await page.locator('[data-setting]').count(),controls);assert.deepEqual(await page.evaluate(()=>saved),[]);
 console.log('Settings navigation: filters, empty state, Escape, clear, keyboard jump, unchanged controls/values passed.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
