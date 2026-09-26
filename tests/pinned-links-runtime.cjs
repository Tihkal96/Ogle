'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts'),profile=path.join(out,`pinned-profile-${Date.now()}`),fixtures=path.join(profile,'fixtures');
  fs.mkdirSync(fixtures,{recursive:true});
  for(const file of ['document.txt','app.exe','extra.txt','other.txt','child.txt'])fs.writeFileSync(path.join(fixtures,file),'Pinned link test fixture');
  const items=[
    {id:'document',name:'Document',path:path.join(fixtures,'document.txt'),kind:'file'},
    {id:'app',name:'Application',path:path.join(fixtures,'app.exe'),kind:'file'},
    {id:'folder',name:'Fixture folder',path:fixtures,kind:'folder'},
    {id:'group',name:'Fixture group',path:null,kind:'group'},
    {id:'extra',name:'Extra',path:path.join(fixtures,'extra.txt'),kind:'file'},
    {id:'other',name:'Other',path:path.join(fixtures,'other.txt'),kind:'file'},
    {id:'child',name:'Child',path:path.join(fixtures,'child.txt'),kind:'file',parentId:'group'}
  ];
  fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'codex',autoStart:false,shortcuts:items,shortcutsView:'icons',autoExpand:true,showTime:true,showDate:true,timeFormat:'12h',dateFormat:'locale',autoCollapseDelay:10000}));
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const executable=process.env.PETDOCK_TEST_EXE,errors=[],checks={};let app;
  async function launch(){
    app=await electron.launch({...(executable?{executablePath:path.resolve(executable),args:[]}:{args:[root]}),env});
    const page=await app.firstWindow();page.on('pageerror',err=>errors.push(err.message));
    await app.evaluate(({screen,shell,net,BrowserWindow})=>{
      const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.hide();
      screen.getCursorScreenPoint=()=>({x:0,y:0});global.__pinOpened=[];
      shell.openPath=async target=>{global.__pinOpened.push({kind:'path',target});return '';};
      shell.openExternal=async target=>{global.__pinOpened.push({kind:'url',target});};
      const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ5kAAAAASUVORK5CYII=','base64');
      net.fetch=async()=>new Response(png,{status:200,headers:{'content-type':'image/png'}});
    });
    await page.waitForSelector('#status-dot.ready',{state:'attached',timeout:60000});
    await page.waitForSelector('.links-entry[data-id="document"]',{state:'attached',timeout:60000});
    return page;
  }
  try{
    let page=await launch();
    const click=async selector=>{await page.locator(selector).evaluate(el=>el.click());await page.waitForFunction(()=>!DockLayoutTransition.busy);};
    const links=()=>click('[data-panel="shortcuts"]');
    const pin=id=>page.locator(`.links-entry[data-id="${id}"] .links-pin`).evaluate(el=>el.click());
    const reveal=async()=>{await page.evaluate(()=>setMode('reveal'));await page.waitForFunction(()=>!DockLayoutTransition.busy);};
    await links();
    for(const id of ['document','app','folder','group','extra'])await pin(id);
    await page.waitForFunction(()=>document.querySelectorAll('#pinned-links .pinned-link').length===5);
    await pin('other');
    assert.match(await page.locator('.links-pin-status').textContent(),/up to 5 links/);
    assert.equal(await page.locator('.links-entry[data-id="other"] .links-pin').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('#pinned-links').isVisible(),true,'Pins remain visible in expanded panels');
    assert.equal(await page.locator('.toolbar').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Expanded toolbar fits five pins');
    checks.fivePinLimitAndFullPanelVisible=true;
    await reveal();
    await page.waitForFunction(()=>document.querySelectorAll('#pinned-links img').length>=4);
    assert.equal(await page.locator('#pinned-links').evaluate(el=>el.previousElementSibling.dataset.panel),'shortcuts');
    const layout=await page.evaluate(()=>{
      const toolbar=document.querySelector('.toolbar'),row=document.getElementById('conversation-strip');
      const b=toolbar.getBoundingClientRect(),r=row.getBoundingClientRect();
      const children=[...toolbar.children].filter(el=>getComputedStyle(el).display!=='none').map(el=>({id:el.id,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
      return {width:innerWidth,toolbar:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},row:{top:r.top,height:r.height},overflow:toolbar.scrollWidth>toolbar.clientWidth,children};
    });
    assert.equal(layout.width,600);assert.equal(layout.row.height,32);assert.ok(layout.row.top>=layout.toolbar.bottom);
    assert.equal(layout.overflow,false,'Five pins with clock/date and keep-open pin fit the toolbar');
    for(const child of layout.children)assert.ok(child.left>=layout.toolbar.left && child.right<=layout.toolbar.right+1,`${child.id} remains inside toolbar`);
    assert.equal(await page.locator('#clock').isVisible(),true);assert.equal(await page.locator('#panel-pin').isVisible(),true);
    checks.separateConversationRowAndNoOverflow=true;
    await page.locator('#clock').evaluate(el=>{el.textContent='11:59 PM · 30.12.2026';});
    assert.equal(await page.locator('.toolbar').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Longest clock/date fits with five pins');
    await page.screenshot({path:path.join(out,'pinned-links-five-pins.png')});
    for(const id of ['document','app'])await click(`#pinned-links [data-link-id="${id}"]`);
    await page.waitForTimeout(100);
    const opened=await app.evaluate(()=>global.__pinOpened);
    assert.deepEqual(opened.map(value=>value.target),[items[0].path,items[1].path]);
    await click('#pinned-links [data-link-id="group"]');
    await page.locator('.links-content .links-entry[data-id="child"]').waitFor();
    assert.equal(await page.locator('#conversation-strip').isHidden(),true);
    await reveal();await click('#pinned-links [data-link-id="folder"]');
    await page.locator('.links-navigation').getByRole('button',{name:'Fixture folder',exact:true}).waitFor();
    assert.ok((await page.locator('.links-content').innerText()).includes('document.txt'));
    assert.equal((await app.evaluate(()=>global.__pinOpened)).length,2,'Groups and folders navigate inside Links');
    checks.filesAppsGroupsFoldersUseCorrectTargets=true;
    await page.locator('.links-navigation').getByRole('button',{name:'All links',exact:true}).click();
    await page.locator('.links-entry[data-id="extra"] button[title="Remove link"]').evaluate(el=>el.click());
    await page.waitForFunction(()=>document.querySelectorAll('#pinned-links .pinned-link').length===4);
    await page.locator('#shortcuts-panel').getByRole('button',{name:'＋ Add',exact:true}).click();
    await page.getByLabel('Path or URL',{exact:true}).fill('https://fixture.invalid/pinned-target');
    await page.locator('#shortcuts-panel').getByRole('button',{name:'Add link',exact:true}).click();
    const urlEntry=page.locator('.links-entry').filter({has:page.locator('.links-open[title="https://fixture.invalid/pinned-target"]')});
    await urlEntry.locator('.links-pin').evaluate(el=>el.click());
    const urlId=await urlEntry.getAttribute('data-id');
    await reveal();await click(`#pinned-links [data-link-id="${urlId}"]`);
    await page.waitForTimeout(100);
    assert.deepEqual((await app.evaluate(()=>global.__pinOpened)).at(-1),{kind:'url',target:'https://fixture.invalid/pinned-target'});
    await links();await page.locator('.links-navigation').getByRole('button',{name:'All links',exact:true}).click();
    await page.locator(`.links-entry[data-id="${urlId}"] button[title="Remove link"]`).evaluate(el=>el.click());
    await page.waitForFunction(()=>document.querySelectorAll('#pinned-links .pinned-link').length===4);
    await pin('app');await page.waitForFunction(()=>document.querySelectorAll('#pinned-links .pinned-link').length===3);
    await pin('app');await page.waitForFunction(()=>document.querySelectorAll('#pinned-links .pinned-link').length===4);
    checks.unpinRemovalAndUrlLaunch=true;
    await reveal();await page.waitForTimeout(250);
    const data=await app.evaluate(async({BrowserWindow,desktopCapturer})=>{const w=BrowserWindow.getAllWindows()[0];const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1200,height:432}});return sources.find(s=>s.id===w.getMediaSourceId())?.thumbnail.toPNG().toString('base64');});
    if(data)fs.writeFileSync(path.join(out,'pinned-links-toolbar.png'),Buffer.from(data,'base64'));
    await app.close();app=null;page=await launch();
    assert.equal(await page.locator('#pinned-links .pinned-link').count(),4);
    const persisted=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));
    assert.deepEqual(persisted.shortcuts.filter(item=>item.pinned).map(item=>item.id),['document','app','folder','group']);
    checks.pinsPersistAcrossRestart=true;assert.deepEqual(errors,[]);
    const report={at:new Date().toISOString(),checks,layout,rendererErrors:errors,profile,limitations:'OS launching and favicon downloads were stubbed; real settings, IPC and local folder navigation were exercised. No prompts, authentication changes or external launches.'};
    fs.writeFileSync(path.join(out,'pinned-links-runtime.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
