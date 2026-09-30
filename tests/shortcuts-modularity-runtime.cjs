'use strict';
const {chromium}=require('playwright'), assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {SettingsStore}=require('../src/main/settings.cjs');
(async()=>{
 const profile=path.resolve(__dirname,'../artifacts',`shortcuts-modular-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});const file=path.join(profile,'settings.json');let store=new SettingsStore(file);
 const items=[{id:'g',kind:'group',name:'Tools',columns:2,rows:3,layoutFlow:'rows'},...Array.from({length:9},(_,i)=>({id:'c'+i,kind:'file',name:'File '+i,path:'C:\\fixture'+i,parentId:'g'})),{id:'outside',kind:'file',name:'Outside',path:'C:\\outside'},{id:'g2',kind:'group',name:'Second'}];store.update({shortcuts:items});
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1100,height:900}});await page.exposeFunction('saveFixture',patch=>store.update(patch));
 async function mount(){await page.setContent('<div id="pinned-links"></div><main id="root"></main>');await page.addStyleTag({path:path.resolve(__dirname,'../src/renderer/shortcuts.css')});await page.addScriptTag({path:path.resolve(__dirname,'../src/renderer/shortcuts.js')});await page.evaluate(settings=>{window.errors=[];window.settings=settings;window.iconResponse=null;PetDockShortcuts.mount(document.querySelector('#root'),{shortcutIcons:()=>new Promise(resolve=>window.iconResponse=resolve)},settings,patch=>{Object.assign(window.settings,patch);return saveFixture(patch)},e=>errors.push(e.message));},store.value);}
 await mount();assert.equal(await page.locator('[data-id="g"] > .links-children > .links-entry').count(),9);assert.equal(await page.locator('.links-group-more').count(),0);
 const widths=await page.locator('.links-entry:not(.links-group) .links-icon').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));assert.ok(widths.every(w=>w===46),'Identical icons inside/outside groups');
 await page.locator('[data-id="g"] > .links-row button[title="Rename or edit target"]').click();await page.getByLabel('Columns',{exact:true}).fill('3');await page.getByLabel('Rows',{exact:true}).fill('2');await page.getByLabel('Group overflow').selectOption('columns');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.links-form').hidden);
 assert.equal(store.value.shortcuts[0].columns,3);assert.equal(store.value.shortcuts[0].rows,2);assert.equal(store.value.shortcuts[0].layoutFlow,'columns');
 await page.locator('[data-id="g"] > .links-row').evaluate(el=>{const data=new DataTransfer();data.setData('application/x-petdock-link','g2');el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));});await page.waitForFunction(()=>document.querySelector('.links-content').firstElementChild.dataset.id==='g2');
 await page.evaluate(()=>iconResponse({'C:\\fixture0':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYVYAAAAASUVORK5CYII='}));await page.waitForFunction(()=>settings.shortcuts.find(x=>x.id==='c0').icon);
 store=new SettingsStore(file);assert.equal(store.value.shortcuts[0].id,'g2');assert.equal(store.value.shortcuts.find(i=>i.id==='g').columns,3);await mount();assert.equal(await page.locator('.links-content > .links-entry').first().getAttribute('data-id'),'g2');assert.equal(await page.locator('[data-id="g"] > .links-children > .links-entry').count(),9);
 const rects=await page.locator('[data-id="g"] > .links-children > .links-entry').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));assert.equal(new Set(rects.map(r=>r.y)).size,2);assert.equal(new Set(rects.map(r=>r.x)).size,5);assert.deepEqual(await page.evaluate(()=>errors),[]);
 // A wide nested frame must enlarge its parent's track, including with column-first flow.
 for (const layoutFlow of ['rows','columns']) {
   store.update({shortcuts:[{id:'parent',kind:'group',name:'Parent',columns:2,rows:2,layoutFlow},{id:'nested',kind:'group',name:'Nested wide group',parentId:'parent',columns:6,rows:1},...Array.from({length:7},(_,i)=>({id:'n'+i,kind:'file',name:'Nested '+i,parentId:'nested',path:'C:\\nested'+i})),...Array.from({length:3},(_,i)=>({id:'s'+i,kind:'file',name:'Sibling '+i,parentId:'parent',path:'C:\\sibling'+i}))]});
   await mount();
   const geometry=await page.locator('[data-id="parent"]').evaluate(parent=>{
     const container=parent.getBoundingClientRect(),children=[...parent.querySelector(':scope > .links-children').children].map(n=>n.getBoundingClientRect());
     const contained=children.every(r=>r.left>=container.left&&r.right<=container.right&&r.top>=container.top&&r.bottom<=container.bottom);
     const disjoint=children.every((a,i)=>children.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
     const nested=parent.querySelector('[data-id="nested"]'),frame=nested.getBoundingClientRect();
     return {contained,disjoint,nestedContained:[...nested.querySelectorAll('.links-icon')].every(n=>{const r=n.getBoundingClientRect();return r.left>=frame.left&&r.right<=frame.right&&r.top>=frame.top&&r.bottom<=frame.bottom}),trackWidth:parseFloat(getComputedStyle(parent.querySelector(':scope > .links-children')).gridTemplateColumns)};
   });
   assert.equal(geometry.contained,true,layoutFlow+' nested frame stays inside parent');assert.equal(geometry.disjoint,true,layoutFlow+' nested frame and siblings never overlap');assert.equal(geometry.nestedContained,true);assert.ok(geometry.trackWidth>500,'Nested 6-column frame expands parent grid track');
 }
 await page.screenshot({path:path.join(profile,'modular-groups.png')});console.log('Shortcuts: 9 visible group items, same-size icons, 3x2 horizontal overflow, reorder and layout survive SettingsStore reload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
