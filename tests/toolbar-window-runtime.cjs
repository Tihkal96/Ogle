'use strict';
// Real native dimensions plus the complete application DOM/styles; no accounts or prompts.
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts','toolbar-window-'+Date.now());fs.mkdirSync(dir,{recursive:true});
 const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/href="([^"]+\.css)"/g,(_,file)=>`href="${pathToFileURL(path.join(root,'src/renderer',file))}"`);
 const fixture=path.join(dir,'fixture.html');fs.writeFileSync(fixture,html);
 const main=path.join(dir,'main.cjs');fs.writeFileSync(main,`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>new BrowserWindow({width:760,height:820,frame:false,show:false}).loadFile(${JSON.stringify(fixture)}));`);
 require('node:child_process').execFileSync(process.execPath,['--check',main]);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[main],env});try{const page=await app.firstWindow();
 for(const mode of ['expand','reveal'])for(const screenWidth of [1920,430]){
  const {dockBounds}=require('../src/main/window-layout.cjs');const bounds=dockBounds(mode,{x:0,y:0,width:600,height:216},{x:0,y:0,width:screenWidth,height:1080});
  await app.evaluate(({BrowserWindow},bounds)=>BrowserWindow.getAllWindows()[0].setBounds(bounds),bounds);
  await page.waitForFunction(b=>innerWidth===b.width&&innerHeight===b.height,bounds);
  await page.evaluate(mode=>{
   document.body.className=mode==='reveal'?'collapsed bar-reveal':'';
   document.querySelector('#clock').textContent='11:59 PM · 10/04/2026';
   document.querySelector('#pinned-links').innerHTML=Array.from({length:7},()=>'<button class="pinned-link">★</button>').join('');
   document.querySelector('#panel-pin').hidden=false;
  },mode);
  const result=await page.evaluate(()=>{const toolbar=document.querySelector('.toolbar'),clock=document.querySelector('#clock'),strip=document.querySelector('#conversation-strip');return {viewport:innerHeight,toolbarBottom:toolbar.getBoundingClientRect().bottom,stripBottom:strip.getBoundingClientRect().bottom,clockWidth:clock.clientWidth,clockScroll:clock.scrollWidth,toolbarWidth:toolbar.clientWidth,toolbarScroll:toolbar.scrollWidth};});
  assert.ok(result.toolbarScroll<=result.toolbarWidth+1,JSON.stringify({mode,screenWidth,result}));assert.ok(result.clockWidth>=result.clockScroll);assert.ok(result.toolbarBottom<=result.viewport,JSON.stringify({mode,screenWidth,result}));
  if(mode==='reveal')assert.ok(result.stripBottom<=result.viewport,JSON.stringify({mode,screenWidth,result}));
 }
 for(const width of [1320,760]){
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setBounds({width,height:820}),width);
  await page.waitForFunction(width=>innerWidth===width&&innerHeight===820,width);
  const pinned=await page.evaluate(()=>{document.body.className='';document.body.dataset.pinnedSide='left';document.querySelector('#side-panel').hidden=false;const toolbar=document.querySelector('.toolbar');return {width:toolbar.clientWidth,scroll:toolbar.scrollWidth,shell:document.querySelector('.shell').getBoundingClientRect().width};});
  assert.ok(pinned.shell>250&&pinned.scroll<=pinned.width+1,JSON.stringify({width,pinned}));
 }
 console.log('PASS complete app DOM at actual expand/reveal native dimensions, standard and 430px displays.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});



