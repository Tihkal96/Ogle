'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts','toolbar-'+Date.now());fs.mkdirSync(dir,{recursive:true});
 const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'),toolbar=html.match(/<nav class="toolbar"[\s\S]*?<\/nav>/)[0];
 const fixture=path.join(dir,'fixture.html');fs.writeFileSync(fixture,`<link rel="stylesheet" href="${pathToFileURL(path.join(root,'src/renderer/styles.css'))}"><body><section class="shell" style="width:736px;flex:none">${toolbar}</section>`);
 const main=path.join(dir,'main.cjs');fs.writeFileSync(main,`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>new BrowserWindow({width:1100,height:250,show:false}).loadFile(${JSON.stringify(fixture)}));`);
 require('node:child_process').execFileSync(process.execPath,['--check',main]);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[main],env});try{const page=await app.firstWindow();
 for(const collapsed of [false,true])for(const width of [736,600,560,430])for(const pins of [5,7])for(const clock of ['23:59 · 2026-10-04','11:59 PM · 10/04/2026']){
  const result=await page.evaluate(({collapsed,width,pins,clock})=>{
   document.body.className=collapsed?'collapsed':'';document.querySelector('.shell').style.width=width+'px';document.querySelector('#clock').textContent=clock;
   document.querySelector('#pinned-links').innerHTML=Array.from({length:pins},(_,i)=>`<button class="pinned-link" title="Link ${i}">★</button>`).join('');
   const toolbar=document.querySelector('.toolbar'),bounds=toolbar.getBoundingClientRect(),time=document.querySelector('#clock');
   return {width:bounds.width,scroll:toolbar.scrollWidth,clock:time.clientWidth,clockScroll:time.scrollWidth,controls:[...toolbar.querySelectorAll('button,time')].filter(e=>getComputedStyle(e).display!=='none').map(e=>({name:e.id||e.title,left:e.getBoundingClientRect().left-bounds.left,right:e.getBoundingClientRect().right-bounds.left}))};
  },{collapsed,width,pins,clock});
  assert.ok(result.scroll<=result.width+1,JSON.stringify({collapsed,width,pins,clock,result}));assert.ok(result.clock>=result.clockScroll,'Clock must not clip');
  for(const control of result.controls)assert.ok(control.left>=0&&control.right<=result.width+1,JSON.stringify({collapsed,width,pins,clock,control}));
 }
 await page.screenshot({path:path.join(dir,'toolbar.png')});console.log('PASS expanded/horizontal toolbar at 736/600/560/430px, 5/7 links, complete 24h/12h date/time. '+dir);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

