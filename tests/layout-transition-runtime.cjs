'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`transition-profile-${Date.now()}`);
  fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex'}));
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const exe=process.env.PETDOCK_TEST_EXE;
  const app=await electron.launch({...(exe?{executablePath:exe,args:[]}:{args:[root]}),env});
  try {
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>window.DockLayoutTransition && typeof state!=='undefined' && state.settings.autoCollapseDelay);
    await page.waitForFunction(()=>!DockLayoutTransition.busy);
    await app.evaluate(({BrowserWindow,screen})=>{
      const win=BrowserWindow.getAllWindows()[0];screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});
      global.transitionSamples=[];
      const original=win.setBounds.bind(win);
      win.setBounds=(bounds,...args)=>{
        const sample={bounds};global.transitionSamples.push(sample);
        win.webContents.executeJavaScript('getComputedStyle(document.body).opacity').then(value=>sample.opacity=Number(value));
        return original(bounds,...args);
      };
    });
    await page.evaluate(()=>{state.settings.autoExpand=false;});
    const change=mode=>page.evaluate(mode=>setMode(mode),mode);
    const pet=()=>page.locator('#pet').boundingBox();
    const before=await pet();
    await change('reveal');await change('expand');
    assert.equal((await pet()).height,before.height,'Full expansion preserves pet size');
    await change('idle');
    await app.evaluate(({BrowserWindow,screen})=>{
      const win=BrowserWindow.getAllWindows()[0],area=screen.getDisplayMatching(win.getBounds()).workArea;
      win.setPosition(area.x+area.width-220,area.y+area.height-180);
    });
    await change('reveal');await change('expand');
    const edge=await app.evaluate(({BrowserWindow,screen})=>{const bounds=BrowserWindow.getAllWindows()[0].getBounds();return {bounds,area:screen.getDisplayMatching(bounds).workArea};});
    assert.ok(edge.bounds.x>=edge.area.x && edge.bounds.y>=edge.area.y);
    assert.ok(edge.bounds.x+edge.bounds.width<=edge.area.x+edge.area.width);
    assert.ok(edge.bounds.y+edge.bounds.height<=edge.area.y+edge.area.height);
    await page.evaluate(()=>Promise.all([setMode('idle'),setMode('expand'),setMode('reveal')]));
    assert.equal(await page.evaluate(()=>state.mode),'reveal');
    assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).opacity),'1');
    assert.equal(await page.evaluate(()=>innerWidth),600);
    await page.emulateMedia({reducedMotion:'reduce'});await change('idle');await change('expand');
    const samples=await app.evaluate(()=>global.transitionSamples);
    assert.ok(samples.length>=7);
    assert.ok(samples.every(s=>s.opacity===0),JSON.stringify(samples));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({nativeResizeHiddenUntilPaint:true,stablePetSize:true,bottomRightClamped:true,rapidChangesSettle:true,reducedMotion:true,samples:samples.length,rendererErrors:errors}));
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
