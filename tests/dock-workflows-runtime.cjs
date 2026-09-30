'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','dock-workflows-'+Date.now());fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoCollapse:false,compactChatTarget:'codex',shortcutVisibility:'',shortcutPanel:'',shortcutBar:'',shortcutChatTarget:''}));const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady&&!DockLayoutTransition.busy);await app.evaluate(({BrowserWindow,screen})=>{BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false);screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
 assert.equal(await page.evaluate(()=>state.settings.autoExpand),false,'Fresh profile defaults to click-only reveal');
 await page.locator('#bar-orb').dispatchEvent('mouseenter');await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>state.mode),'idle');
 await page.locator('#pet').evaluate(el=>el.click());await page.waitForFunction(()=>state.mode==='reveal'&&!DockLayoutTransition.busy);
 await page.evaluate(async()=>{await save({autoCollapse:true,autoExpand:false,autoCollapseDelay:1000});applySettings();await setMode('reveal');});
 assert.equal(await page.locator('#panel-pin').getAttribute('hidden'),null,'Pin follows collapse setting, not hover setting');await page.waitForFunction(()=>state.mode==='idle');
 await page.locator('#bar-orb').dispatchEvent('mouseenter');await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>state.mode),'idle','Hover remains disabled');
 await page.evaluate(async()=>{await save({autoExpand:true,autoCollapse:false});applySettings();state.suppressHoverReveal=false;pointerInside(true,true);});await page.waitForFunction(()=>state.mode==='reveal'&&!DockLayoutTransition.busy);await page.waitForTimeout(1150);assert.equal(await page.evaluate(()=>state.mode),'reveal','Hover can reveal without auto-collapse');assert.equal(await page.locator('#panel-pin').isVisible(),false);
 await page.evaluate(()=>setMode('quick'));await page.locator('#prompt').fill('abcdefghijklmnopqrstuvwx');
 const points=await page.evaluate(()=>{const input=$('prompt');input.setSelectionRange(0,0);const a=OgleCaret.point(input);input.setSelectionRange(input.value.length,input.value.length);const b=OgleCaret.point(input);input.value='line one\nline two';input.setSelectionRange(0,0);const c=OgleCaret.point(input);input.setSelectionRange(input.value.length,input.value.length);return {a,b,c,d:OgleCaret.point(input)};});
 assert.ok(points.b.x>points.a.x+50,'Caret follows typed characters horizontally');assert.ok(points.d.y>points.c.y,'Caret follows newline vertically');
 await page.locator('#prompt').focus();await page.waitForFunction(()=>$('pet').dataset.state==='watching');const frame=await page.locator('#pet').getAttribute('data-frame');await page.evaluate(()=>onEvent({type:'pointer',inside:false,x:9999,y:-9999}));await page.waitForTimeout(100);assert.equal(await page.locator('#pet').getAttribute('data-frame'),frame,'Pointer movement cannot redirect typing gaze');
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0],original=w.setIcon.bind(w);w.setIcon=image=>{global.fixedIcon=image.toDataURL();original(image);};});await page.evaluate(()=>api.saveSettings({petId:'rinne-mini'}));const same=await app.evaluate(({nativeImage},iconPath)=>global.fixedIcon===nativeImage.createFromPath(iconPath).toDataURL(),path.join(root,'assets/ogle.png'));assert.equal(same,true,'Native window uses the supplied eye image');
 console.log('Independent hover/collapse, pin visibility, typing caret tracking and fixed application icon passed.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
