'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<div id="pinned-links"></div><section id="links"></section><section id="shell" style="width:800px;height:500px"></section>');
  for(const file of ['shortcuts.css','terminal.css','vendor/bundle.css'])await page.addStyleTag({path:path.resolve(__dirname,'../src/renderer',file)});
  for(const file of ['vendor/bundle.js','shortcuts.js','terminal.js'])await page.addScriptTag({path:path.resolve(__dirname,'../src/renderer',file)});
  await page.evaluate(()=>{
   window.failures=[];window.commits=0;
   const items=[{id:'parent',name:'Parent',kind:'group'},...Array.from({length:3},(_,i)=>({id:'first'+i,name:'First '+i,kind:'url',path:'https://example.com/'+i,parentId:'parent'})),{id:'nested',name:'Nested',kind:'group',parentId:'parent',pinned:true},{id:'last',name:'Last',kind:'url',path:'https://example.org',parentId:'parent'},{id:'child',name:'Child',kind:'url',path:'https://example.net',parentId:'nested'}];
   window.savedLinks=items;
   PetDockShortcuts.mount(document.querySelector('#links'),{openShortcut:async()=>{}},{shortcuts:items,shortcutsView:'icons'},async patch=>{savedLinks=patch.shortcuts;commits++;},e=>failures.push(e.message));
  });
  assert.equal(await page.locator('[data-id="nested"]').count(),0,'Collapsed parent initially hides fourth item');
  await page.getByRole('button',{name:'Open Nested',exact:true}).click();
  assert.equal(await page.locator('[data-id="nested"]').isVisible(),true);
  assert.equal(await page.locator('[data-id="child"]').isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'Open group Parent',exact:true}).getAttribute('aria-expanded'),'true');
  await page.locator('[data-id="child"] button[title="Rename or edit target"]').click();
  await page.getByLabel('Display name',{exact:true}).fill('Enter saves');
  await page.getByLabel('Display name',{exact:true}).press('Enter');
  await page.waitForFunction(()=>savedLinks.find(x=>x.id==='child').name==='Enter saves');
  assert.equal(await page.evaluate(()=>commits),1,'Enter saves exactly once');
  await page.locator('[data-id="child"] button[title="Rename or edit target"]').click();
  await page.getByLabel('Display name',{exact:true}).fill('Click saves');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>savedLinks.find(x=>x.id==='child').name==='Click saves');
  assert.equal(await page.evaluate(()=>commits),2,'Click saves exactly once');
  await page.evaluate(()=>{
   OgleDiagnostics={record:e=>failures.push(e.message)};
   let next=0;
   PetDockTerminal.mount(document.querySelector('#shell'),{terminalCreate:async options=>({...options,id:'fixture-'+(++next)}),terminalWrite:async()=>{},terminalResize:async()=>{},terminalClose:async()=>{},onEvent:callback=>window.shellEvent=callback});
  });
  await page.getByRole('button',{name:'New Command Prompt',exact:true}).click();
  await page.getByRole('button',{name:'New administrator PowerShell',exact:true}).click();
  const status=page.locator('.terminal-status');
  await page.waitForFunction(()=>document.querySelector('.terminal-status').textContent==='Administrator session');
  await page.getByRole('button',{name:'CMD',exact:true}).click();assert.equal(await status.innerText(),'Terminal ready');
  await page.evaluate(()=>shellEvent({type:'terminal',id:'fixture-2',event:'exit'}));assert.equal(await status.innerText(),'Terminal ready','Inactive exit does not overwrite active status');
  await page.getByRole('button',{name:'ADMIN · PowerShell · ended',exact:true}).click();assert.equal(await status.innerText(),'Session ended');
  await page.getByRole('button',{name:'Close session',exact:true}).click();assert.equal(await status.innerText(),'Terminal ready');
  await page.getByRole('button',{name:'Close session',exact:true}).click();assert.match(await status.innerText(),/Create a CMD/);
  assert.deepEqual(await page.evaluate(()=>failures),[]);
  console.log('Pinned nested groups, single-submit Enter/click saves, named group expansion and per-session shell status passed. No real shell/admin/clipboard access.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
