'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`editor-highlight-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,compactChatTarget:'codex',shortcutVisibility:'',shortcutPanel:'',shortcutBar:''}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try{
 const page=await app.firstWindow();await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.hide();screen.getCursorScreenPoint=()=>({x:-9999,y:-9999});});
 await page.waitForFunction(()=>typeof messageView!=='undefined'&&state.settings.autoExpand===false&&!DockLayoutTransition.busy);
 await app.evaluate(({ipcMain})=>{global.highlightClipboard='';ipcMain.removeHandler('dock:clipboardWriteText');ipcMain.handle('dock:clipboardWriteText',(_event,text)=>{global.highlightClipboard=text;});});
 await page.evaluate(()=>switchPanel('editor'));await page.waitForFunction(()=>!DockLayoutTransition.busy);
 const text=Array.from({length:80},(_,i)=>`line ${i} alpha ${i === 1 || i === 64 ? 'target omega target' : 'filler words here'} end`).join('\n');
 await page.evaluate(text=>{const view=PetDockVendors.EditorView.findFromDOM(document.querySelector('.cm-editor'));view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}});},text);
 async function select(line){await page.evaluate(line=>{const view=PetDockVendors.EditorView.findFromDOM(document.querySelector('.cm-editor')),from=view.state.doc.line(line).from+`line ${line-1} alpha `.length;view.dispatch({selection:{anchor:from,head:from+6},scrollIntoView:true});view.focus();},line);await page.waitForTimeout(150);}
 async function check(theme){
 const result=await page.evaluate(()=>{const view=PetDockVendors.EditorView.findFromDOM(document.querySelector('.cm-editor')),sel=view.state.selection.main,start=view.domAtPos(sel.from),end=view.domAtPos(sel.to),range=document.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);const expected=range.getBoundingClientRect(),node=document.querySelector('.cm-selectionBackground'),actual=node.getBoundingClientRect(),match=document.querySelector('.cm-selectionMatch');return {activeFill:getComputedStyle(document.querySelector('.cm-activeLine')).backgroundColor,text:view.state.sliceDoc(sel.from,sel.to),fill:getComputedStyle(node).backgroundColor,dx:Math.abs(actual.x-expected.x),dy:Math.abs(actual.y-expected.y),dw:Math.abs(actual.width-expected.width),matchFill:match&&getComputedStyle(match).backgroundColor,matchDecoration:match&&getComputedStyle(match).textDecorationLine};});
 assert.equal(result.activeFill,'rgba(0, 0, 0, 0)','Active row must not occlude selection layer');assert.equal(result.text,'target');assert.equal(result.fill,theme==='light'?'rgb(159, 200, 250)':'rgb(36, 92, 145)');assert.ok(result.dx<2&&result.dy<4&&result.dw<2,JSON.stringify(result));assert.equal(result.matchFill,'rgba(0, 0, 0, 0)');assert.equal(result.matchDecoration,'underline');
 await page.getByRole('button',{name:'Copy selection',exact:true}).click();assert.equal(await app.evaluate(()=>global.highlightClipboard),'target');
 }
 for(const theme of ['dark','light','midnight']){await page.evaluate(theme=>PetDockEditor.applyTheme(theme),theme);await select(2);await check(theme);await select(65);await check(theme);}
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(650,650));await select(65);await check('midnight');
 await page.evaluate(()=>switchPanel('notes'));await page.waitForFunction(()=>!DockLayoutTransition.busy);await page.evaluate(()=>switchPanel('editor'));await page.waitForFunction(()=>!DockLayoutTransition.busy);await select(65);await check('midnight');
 await page.locator('.cm-editor').screenshot({path:path.join(profile,'selection-visible.png')});
 console.log('Editor selection contrast, distinct occurrence marks, copied range and highlight geometry passed in all themes, after scrolling, resizing and reopening.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
