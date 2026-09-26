'use strict';
// Real renderer/main IPC with isolated PetDock preferences. Never signs in/out or installs a pet.
const { _electron: electron }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..'),output=path.join(root,'artifacts');
  const profile=path.join(output,`interaction-profile-${Date.now()}`);
  fs.mkdirSync(profile,{recursive:true});
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[root],env});
  const errors=[],checks={};
  try {
    const page=await app.firstWindow();page.on('pageerror',err=>errors.push(err.message));
    await app.evaluate(({screen,shell,Menu})=>{
      global.__interactionCursor={x:0,y:0};screen.getCursorScreenPoint=()=>global.__interactionCursor;
      global.__interactionLaunches=[];shell.openExternal=async url=>{global.__interactionLaunches.push(url);};
      global.__interactionMenu=[];Menu.buildFromTemplate=template=>{global.__interactionMenu=template;return {popup(){}};};
    });
    await page.waitForSelector('.cm-editor',{state:'attached',timeout:60000});
    await page.waitForFunction(()=>document.getElementById('pet').dataset.state==='idle');
    const bounds=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
    const click=selector=>page.locator(selector).evaluate(el=>el.click());
    const collapsed=()=>page.locator('body').evaluate(el=>el.classList.contains('collapsed'));
    if(!await collapsed())await click('#collapse');
    const initial=await bounds();
    assert.equal(initial.width,220);assert.ok(initial.height<=200);
    assert.equal(await page.locator('#minimize,#close,#pet-select,[data-shell]').count(),0);
    await page.locator('#pet').dispatchEvent('mouseenter');
    await page.waitForFunction(()=>document.getElementById('pet').dataset.state==='waving');
    await page.locator('#pet').dispatchEvent('mouseleave');
    checks.petHoverWaves=true;
    // The current Auto behavior reveals only the compact toolbar, never a full panel.
    await app.evaluate((_,b)=>{global.__interactionCursor={x:b.x+25,y:b.y+140};},initial);
    await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>state.mode),'idle','Native window hover alone is inert');
    await page.locator('#bar-orb').dispatchEvent('mouseenter');
    await page.waitForFunction(()=>state.mode==='reveal',null,{timeout:1500});
    await page.waitForTimeout(3300);assert.equal(await page.evaluate(()=>state.mode),'reveal','Long orb hover never opens a full panel');
    checks.hoverRevealsBarOnly=true;
    await click('#settings-button');
    await page.locator('[data-setting="autoExpand"]').uncheck();assert.equal(await page.locator('#panel-pin').isHidden(),true);
    await click('#collapse');
    await page.locator('#bar-orb').dispatchEvent('mouseenter');await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>state.mode),'idle','Auto off blocks hover reveal');
    await click('#bar-orb');
    await click('[data-panel="notes"]');assert.equal(await collapsed(),false,'Explicit tab click expands immediately');
    checks.autoOffAndPinGating=true;
    await click('#settings-button');
    await page.locator('[data-setting="theme"]').selectOption('midnight');
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='midnight');
    await page.locator('[data-setting="petScale"]').evaluate(el=>{el.value='1.4';el.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--pet-scale')==='1.4');
    assert.equal((await bounds()).height,878);
    await page.locator('[data-setting="showDate"]').check();
    await page.locator('[data-setting="dateFormat"]').selectOption('iso');
    await page.waitForFunction(()=>/\d{4}-\d{2}-\d{2}/.test(document.getElementById('clock').textContent));
    checks.settingsThemeScaleDate=true;
    await click('[data-panel="editor"]');
    for(const language of ['c','cpp','csharp','vb','cmd','sql','powershell']) {
      await page.locator('.editor-language').selectOption(language);
      assert.equal(await page.locator('.cm-editor').count(),1);
    }
    await page.locator('.editor-language').selectOption('csharp');
    await page.locator('.editor-framework').selectOption('3.5');
    await page.locator('.cm-content').fill('class Example { async void Run() {} }');
    await page.waitForFunction(()=>document.querySelector('.editor-hints').textContent.includes('Async/await'));
    assert.match(await page.locator('.editor-hints').textContent(),/not compiler validation/);
    await page.waitForTimeout(550);
    const stored=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));
    assert.equal(stored.editorTabs[0].framework,'3.5');assert.equal(stored.editorTabs[0].dirty,true);
    checks.editorLanguagesAndFramework=true;
    // Native context-menu construction is exercised, while popup display is replaced to avoid blocking automation.
    await page.locator('#pet').dispatchEvent('contextmenu');await page.waitForTimeout(100);
    const menu=await app.evaluate(()=>global.__interactionMenu.map(item=>item.label).filter(Boolean));
    assert.ok(menu.includes('Settings')&&menu.includes('Minimize')&&menu.includes('Quit Ogle'));
    await app.evaluate(()=>global.__interactionMenu.find(item=>item.label==='Collapse dock').click());
    await page.waitForFunction(()=>document.body.classList.contains('collapsed'));
    await page.locator('#pet').dispatchEvent('contextmenu');await page.waitForTimeout(100);
    await app.evaluate(()=>global.__interactionMenu.find(item=>item.label==='Expand dock').click());
    await page.waitForFunction(()=>!document.body.classList.contains('collapsed'));
    checks.contextMenuAndToggle=true;
    // Restore scale and compact size for a bounded physical move with a deterministic OS cursor.
    await click('#settings-button');
    await page.locator('[data-setting="petScale"]').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForTimeout(150);await click('#collapse');await page.waitForTimeout(150);
    const before=await bounds(),pet=await page.locator('#pet').boundingBox();
    await app.evaluate(()=>{global.__interactionCursor={x:1500,y:850};});
    await page.mouse.move(pet.x+pet.width/2,pet.y+pet.height/2);await page.mouse.down();await page.waitForTimeout(100);
    await app.evaluate(()=>{global.__interactionCursor={x:1420,y:810};});
    await page.mouse.move(pet.x+pet.width/2-20,pet.y+pet.height/2-10);await page.waitForTimeout(150);await page.mouse.up();await page.waitForTimeout(150);
    const after=await bounds();assert.equal(after.x,before.x-80);assert.equal(after.y,before.y-40);
    assert.deepEqual(await app.evaluate(()=>global.__interactionLaunches),[],'Dragging must not launch Codex');
    await page.locator('#pet').click();await page.waitForTimeout(150);
    assert.equal((await app.evaluate(()=>global.__interactionLaunches)).length,1,'Normal click opens Codex once');
    checks.dragMovesWithoutOpeningAndClickOpens=true;
    // Exercise canonical desktop notifications without sending a prompt or reading a real task.
    await page.mouse.move(0,0);
    await page.locator('#pet').dispatchEvent('mouseleave');
    await click('[data-panel="chats"]');
    const fakeThreadId='petdock-runtime-fixture-no-backend-task';
    await page.evaluate(id=>{state.selected={id,name:'Injected notification fixture',cwd:''};updateComposer();},fakeThreadId);
    await page.locator('#prompt').fill('Uns ent local test draft — never submitted');
    assert.equal(await page.locator('#send').isEnabled(),true);
    const notify=async(runtime,status)=>app.evaluate(({BrowserWindow},payload)=>{
      BrowserWindow.getAllWindows()[0].webContents.send('dock:event',{
        type:'codex',method:'petdock/threadState',params:{
          thread:{id:payload.id,name:'Injected notification fixture',cwd:'',turns:[{id:'fixture-turn',status:payload.status,items:[]}]},
          runtime:payload.runtime,requestCount:payload.runtime.waitingForApproval?1:0
        }
      });
    },{id:fakeThreadId,runtime:{...runtime,source:'desktop',turnId:'fixture-turn'},status});
    await notify({running:true},'inProgress');
    await page.waitForFunction(()=>document.getElementById('pet').dataset.state==='running');
    assert.equal(await page.locator('#send').isDisabled(),true,'Running desktop task disables Send');
    await notify({running:true,waitingForApproval:true},'inProgress');
    await page.waitForFunction(()=>document.getElementById('pet').dataset.state==='waiting');
    assert.equal(await page.locator('#desktop-approval').isVisible(),true);
    await notify({running:false},'completed');
    await page.waitForFunction(()=>document.getElementById('pet').dataset.state==='review');
    assert.equal(await page.locator('#send').isEnabled(),true,'Completed desktop task permits a new draft');
    assert.equal(await page.locator('#desktop-approval').isHidden(),true);
    await notify({running:true},'inProgress');
    await page.waitForFunction(()=>document.getElementById('pet').dataset.state==='running');
    await notify({running:false},'failed');
    await page.waitForFunction(()=>document.getElementById('pet').dataset.state==='failed');
    assert.equal(await page.locator('#send').isEnabled(),true);
    checks.desktopRunningWaitingCompletionFailure=true;
    const chatActivity=activity=>app.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows()[0].webContents.send('dock:event',{type:'chatgpt-activity',state:value}),activity);
    await page.locator('#pet').dispatchEvent('mouseenter');
    await notify({running:true},'inProgress');await chatActivity('working');
    await notify({running:false},'completed');
    await page.waitForTimeout(1300);
    assert.equal(await page.locator('#pet').getAttribute('data-state'),'running','ChatGPT keeps the pet working after Codex finishes');
    const generation=Number(await page.locator('#pet').getAttribute('data-generation'));
    await chatActivity('done');
    await page.waitForFunction(previous=>{const pet=document.getElementById('pet');return pet.dataset.state==='review'&&pet.dataset.frame==='0'&&Number(pet.dataset.generation)>previous;},generation,{timeout:1000,polling:'raf'});
    const frames=await page.evaluate(()=>new Promise(resolve=>{
      const pet=document.getElementById('pet'),values=[Number(pet.dataset.frame)];
      const observer=new MutationObserver(()=>{const value=Number(pet.dataset.frame);if(pet.dataset.state==='review'&&values.at(-1)!==value)values.push(value);});
      observer.observe(pet,{attributes:true,attributeFilter:['data-frame']});
      setTimeout(()=>{observer.disconnect();resolve(values);},1400);
    }));
    assert.deepEqual(frames.slice(0,7),[0,1,2,3,4,5,0],'Completion starts at zero and plays a full ordered cycle');
    assert.equal(await page.locator('#pet').getAttribute('data-state'),'review','Hover cannot override completion');
    await chatActivity('working');await page.waitForFunction(()=>document.getElementById('pet').dataset.state==='running');
    await chatActivity('failed');await page.waitForFunction(()=>{const p=document.getElementById('pet');return p.dataset.state==='failed'&&p.dataset.frame==='0';},null,{timeout:1000,polling:'raf'});
    checks.sharedWorkingAndCompletionFrameCycle=true;

    await page.locator('#prompt').fill('');
    await page.evaluate(()=>{state.selected=null;updateComposer();});
    await click('#collapse');
    assert.deepEqual(errors,[]);
    const screenshot=await app.evaluate(async({BrowserWindow,desktopCapturer})=>{
      const win=BrowserWindow.getAllWindows()[0];const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1200,height:400}});return sources.find(source=>source.id===win.getMediaSourceId())?.thumbnail.toPNG().toString('base64');
    });
    if(screenshot)fs.writeFileSync(path.join(output,'interaction-compact.png'),Buffer.from(screenshot,'base64'));
    const report={at:new Date().toISOString(),checks,rendererErrors:errors,profile,limitations:'OS cursor and native menu popup were stubbed at their boundaries; real renderer events, IPC validation, timers, settings persistence and BrowserWindow movement were exercised. No authentication or remote pet installation performed.'};
    fs.writeFileSync(path.join(output,'interaction-runtime.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await app.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
