'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`collapse-profile-${Date.now()}`);
  fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex'}));
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const exe=process.env.PETDOCK_TEST_EXE;
  const app=await electron.launch({...(exe?{executablePath:path.resolve(exe),args:[]}:{args:[root]}),env});
  try{
    const page=await app.firstWindow();
    await app.evaluate(({screen})=>{screen.getCursorScreenPoint=()=>({x:0,y:0});});
    await page.waitForSelector('[data-setting="autoCollapseDelay"]',{state:'attached'});
    const click=async selector=>{await page.waitForFunction(()=>!DockLayoutTransition.busy);await page.locator(selector).evaluate(el=>el.click());await page.waitForFunction(()=>!DockLayoutTransition.busy);};
    await click('#settings-button');
    const delay=page.locator('[data-setting="autoCollapseDelay"]');
    assert.equal(await delay.inputValue(),'10');
    assert.equal(await page.evaluate(()=>state.settings.autoCollapseDelay),10000);
    await delay.fill('12');await delay.press('Tab');
    await page.waitForFunction(()=>state.settings.autoCollapseDelay===12000);
    assert.equal(await delay.inputValue(),'12');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8')).autoCollapseDelay,12000);
    await delay.fill('1');await delay.press('Tab');
    await page.waitForFunction(()=>state.settings.autoCollapseDelay===1000);
    await click('#collapse');
    await page.evaluate(()=>document.activeElement?.blur());
    const started=Date.now();
    await page.locator('#dock').dispatchEvent('mouseleave');
    await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>state.mode),'reveal');
    await page.waitForFunction(()=>state.mode==='idle',null,{timeout:1800});
    assert.ok(Date.now()-started>=900,'Uses the configured second, not the former 700ms delay');
    console.log(JSON.stringify({defaultSeconds:10,settingPersisted:true,secondsDisplay:true,configuredRevealCollapse:true}));
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
