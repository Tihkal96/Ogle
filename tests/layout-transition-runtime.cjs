'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`transition-profile-${Date.now()}`);
  fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',petScale:1.6}));
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const exe=process.env.PETDOCK_TEST_EXE;
  const app=await electron.launch({...(exe?{executablePath:exe,args:[]}:{args:[root]}),env});
  try {
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>window.DockLayoutTransition && typeof state!=='undefined' && state.settings.autoCollapseDelay);
    await page.waitForFunction(()=>!DockLayoutTransition.busy);
    await app.evaluate(({BrowserWindow,screen})=>{
      const win=BrowserWindow.getAllWindows()[0];screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});
      global.transitionSamples=[];global.positionSamples=[];const originalPosition=win.setPosition.bind(win);win.setPosition=(x,y,...args)=>{global.positionSamples.push({x,y});return originalPosition(x,y,...args);};
      const original=win.setBounds.bind(win);
      win.setBounds=(bounds,...args)=>{
        const sample={bounds,nativeOpacity:win.getOpacity()};global.transitionSamples.push(sample);
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
      const box=win.getBounds();win.setPosition(area.x+area.width-box.width,area.y+area.height-box.height);
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
    assert.ok(samples.every(s=>s.opacity===0 && s.nativeOpacity===0),JSON.stringify(samples));
    const positions=await app.evaluate(()=>global.positionSamples);assert.ok(positions.length>8,'Edge clamping uses intermediate positions instead of one jump');
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getOpacity()),1);
    const recovered=await page.evaluate(async()=>{try{await DockLayoutTransition.run(()=>{throw new Error('fixture render failure');},()=>null,'expand');return false;}catch{return !DockLayoutTransition.busy && document.body.style.opacity==='1';}});
    assert.equal(recovered,true);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getOpacity()),1);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({nativeResizeHiddenUntilPaint:true,smoothEdgeMovement:true,failureRestoresVisibility:true,stablePetSize:true,bottomRightClamped:true,rapidChangesSettle:true,reducedMotion:true,samples:samples.length,rendererErrors:errors}));
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
