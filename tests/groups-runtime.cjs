'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`groups-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await page.waitForFunction(()=>typeof PetDockShortcuts!=='undefined'&&typeof state!=='undefined'&&state.settings);
 await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.setBounds({x:0,y:0,width:900,height:700});screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
 await page.evaluate(()=>{state.settings.autoExpand=false;switchPanel('shortcuts'); const fixture=document.createElement('div');fixture.id='group-fixture';fixture.style='position:fixed;inset:0;z-index:99999;background:#20252a;color:white;display:flex;flex-direction:column';document.body.append(fixture);window.savedLinks=null;window.groupErrors=[];window.OgleLinksTools=null;
 const shortcuts=[{id:'g',name:'Tools',kind:'group',parentId:null},...Array.from({length:6},(_,i)=>({id:'c'+i,name:'Child '+i,kind:'url',path:'https://example.com/'+i,parentId:'g'})),{id:'outside',name:'Outside',kind:'url',path:'https://example.com',parentId:null},{id:'g2',name:'Other',kind:'group',parentId:null}];
 PetDockShortcuts.mount(fixture,{openShortcut:async()=>{}},{shortcuts,shortcutsView:'icons'},async v=>{window.savedLinks=v.shortcuts},e=>window.groupErrors.push(e.message));});
 const g=page.locator('#group-fixture [data-id="g"]');
 assert.equal(await g.locator(':scope > .links-children > .links-entry').count(),3);
 const size=await page.locator('#group-fixture [data-id="c0"] .links-icon').boundingBox(),outside=await page.locator('#group-fixture [data-id="outside"] .links-icon').boundingBox();assert.equal(size.width,outside.width);assert.equal(size.height,outside.height);
 await g.getByRole('button',{name:'Show all 6 links',exact:true}).click();assert.equal(await g.locator(':scope > .links-children > .links-entry').count(),6);
 const geometry=await g.evaluate(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('.links-children .links-icon')].every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom})});assert.equal(geometry,true);
 const expandedBox=await g.boundingBox(),following=await page.locator('#group-fixture [data-id="outside"]').boundingBox();assert.ok(following.y>=expandedBox.y+expandedBox.height,'Expanded group displaces following tiles');
 await g.getByRole('button',{name:'Collapse group',exact:true}).click();
 // Pointer-driven native HTML dragging from the labels, not synthetic drop events.
 await page.locator('#group-fixture [data-id="c2"] .links-label').dragTo(page.locator('#group-fixture [data-id="c0"] > .links-row'));
 await page.waitForFunction(()=>savedLinks?.filter(x=>x.parentId==='g')[0]?.id==='c2');
 await page.locator('#group-fixture [data-id="outside"] .links-label').dragTo(page.locator('#group-fixture [data-id="g2"] > .links-children'));
 await page.waitForFunction(()=>savedLinks?.find(x=>x.id==='outside')?.parentId==='g2');
 await page.locator('#group-fixture [data-id="g2"] > .links-row .links-label').dragTo(page.locator('#group-fixture [data-id="g"] > .links-row'));
 await page.waitForFunction(()=>savedLinks?.filter(x=>!x.parentId)[0]?.id==='g2');
 assert.deepEqual(await page.evaluate(()=>groupErrors),[]);
 await page.screenshot({path:path.join(root,'artifacts/groups-v11.png')});console.log('Inline group icon geometry, expansion and label drag/drop/reordering passed');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
