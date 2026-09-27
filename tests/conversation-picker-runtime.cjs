'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`picker-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,autoExpand:false,shortcutVisibility:'',shortcutPanel:'',shortcutBar:''}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen,ipcMain})=>{BrowserWindow.getAllWindows()[0].hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});ipcMain.removeHandler('dock:readThread');ipcMain.handle('dock:readThread',(_e,id)=>({thread:{id,turns:[]},runtime:{running:false}}));});
  await page.waitForFunction(()=>typeof state!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
  await page.evaluate(()=>{state.connected=false;state.threads=[{id:'a',name:'Alpha task',cwd:'C:\\Alpha'},{id:'b',name:'Beta task',cwd:'C:\\Beta'},{id:'c',name:'Second alpha task',cwd:'C:\\Alpha'}];renderProjects();renderThreads();return setMode('reveal');});
  await page.locator('#conversation-picker-toggle').click();await page.waitForFunction(()=>state.mode==='picker'&&!DockLayoutTransition.busy);
  assert.equal(await page.locator('#compact-project-filter').count(),0);
  const geometry=await page.evaluate(()=>{const list=$('conversation-picker'),box=list.getBoundingClientRect(),bar=$('conversation-strip').getBoundingClientRect(),heading=document.querySelector('.compact-project-name'),item=document.querySelector('.compact-thread');return{position:getComputedStyle(list).position,top:box.top,barBottom:bar.bottom,width:box.width,rows:[...document.querySelectorAll('.compact-thread')].map(el=>el.getBoundingClientRect().y),indent:parseFloat(getComputedStyle(item).paddingLeft)-parseFloat(getComputedStyle(heading).paddingLeft)};});
  assert.equal(geometry.position,'absolute');assert.ok(geometry.top>=geometry.barBottom);assert.ok(geometry.width<=360);assert.ok(geometry.rows.every((y,i,rows)=>i===0||y>rows[i-1]));assert.ok(geometry.indent>0);
  await page.screenshot({path:path.join(root,'artifacts/conversation-dropdown.png')});
  await page.locator('#compact-search').fill('Beta');assert.equal(await page.getByRole('option').count(),1);await page.locator('#compact-search').press('ArrowDown');await page.getByRole('option',{name:'Beta task',exact:true}).press('Enter');
  await page.waitForFunction(()=>state.selected?.id==='b'&&state.mode==='quick'&&!DockLayoutTransition.busy);assert.equal(await page.locator('#conversation-picker').isHidden(),true);
  await page.evaluate(()=>setMode('reveal'));await page.locator('#conversation-picker-toggle').click();await page.waitForFunction(()=>state.mode==='picker'&&!DockLayoutTransition.busy);await page.locator('#compact-search').press('Escape');await page.waitForFunction(()=>state.mode==='reveal');
  await page.evaluate(()=>onEvent({type:'toggle-bar'}));await page.waitForFunction(()=>state.mode==='idle'&&!DockLayoutTransition.busy);await page.evaluate(()=>onEvent({type:'toggle-bar'}));await page.waitForFunction(()=>state.mode==='reveal'&&!DockLayoutTransition.busy);
  const font=await page.locator('#activity-stats').evaluate(el=>({font:getComputedStyle(el).fontFamily,z:getComputedStyle(el).zIndex,petZ:getComputedStyle(document.querySelector('#pet')).zIndex}));assert.match(font.font,/Century Gothic/);assert.ok(Number(font.z)<Number(font.petZ));
  console.log('Dropdown projects/tasks, indentation, keyboard selection, dismissal, bar/ball action and meter font/layer passed');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
