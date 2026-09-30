'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage();await page.setContent('<main id="settings"></main>');
  await page.addScriptTag({path:path.resolve(__dirname,'../src/renderer/settings.js')});
  const catalog=require('../assets/pet-catalog.json');
  await page.evaluate(catalog=>{
   window.errors=[];window.OgleDiagnostics={record:e=>errors.push(String(e))};window.OgleSettingsNavigation={mount(){}};
   window.fixturePets=[{id:'rinne-mini',name:'Rinne Mini',config:{author:'Fixture creator',sourceUrl:'https://codex-pets.net/share/rinne-mini'}}];window.fixtureSettings={petId:'rinne-mini'};window.installed=[];window.opened=[];
   const api={codexAccount:async()=>null,terminalAdminStatus:async()=>({available:false}),recommendedPets:async()=>catalog,openShortcut:async url=>opened.push(url),installPet:async id=>{installed.push(id);const entry=catalog.find(p=>p.id===id);const pet={id,name:entry.name,config:{author:entry.author,sourceUrl:entry.sourceUrl}};fixturePets.push(pet);return {pet,pets:fixturePets,codex:{status:'unavailable'}}}};
   PetDockSettings.mount(document.querySelector('#settings'),api,fixtureSettings,fixturePets,async patch=>Object.assign(fixtureSettings,patch),()=>{},e=>errors.push(String(e)),async()=>fixturePets,()=>{});
  },catalog);
  await page.getByRole('button',{name:'Download Fern',exact:true}).waitFor();
  assert.equal(await page.locator('.settings-pet-recommendations .settings-row').count(),3);
  for(const entry of catalog)assert.ok((await page.locator('.settings-pet-recommendations').innerText()).includes(entry.author));
  assert.match(await page.locator('[data-pet-credit]').innerText(),/Fixture creator/);
  await page.getByRole('button',{name:'Download Fern',exact:true}).click();
  await page.waitForFunction(()=>fixtureSettings.petId==='fern');
  assert.match(await page.locator('[data-pet-credit]').innerText(),/pixel/);
  await page.locator('[data-pet-credit]').getByRole('button',{name:'Source',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>opened),[catalog[0].sourceUrl]);
  assert.deepEqual(await page.evaluate(()=>installed),['fern']);assert.deepEqual(await page.evaluate(()=>errors),[]);
  console.log('PASS recommendation creator credits, download selection, and source links');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
