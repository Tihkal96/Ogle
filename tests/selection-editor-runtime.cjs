'use strict';
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts',`selection-editor-${Date.now()}`);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>new BrowserWindow({show:false}).loadFile(${JSON.stringify(path.join(dir,'fixture.html'))}));`);
 const url=file=>'file:///'+path.join(root,file).replaceAll('\\','/');
 fs.writeFileSync(path.join(dir,'fixture.html'),`<div id="editor"></div><script src="${url('src/renderer/vendor/bundle.js')}"></script><script src="${url('src/renderer/editor.js')}"></script><script>window.errors=[];window.saved=null;PetDockEditor.mount(document.querySelector('#editor'),{}, {editorTabs:[]},async value=>saved=value,error=>errors.push(String(error)));</script>`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const app=await electron.launch({args:[path.join(dir,'main.cjs')],env});
 try{
 const page=await app.firstWindow(),editor=page.locator('.cm-content');await editor.waitFor();await editor.fill('original text');await page.keyboard.press('Control+End');await page.keyboard.press('Control+Shift+ArrowLeft');assert.equal(await page.evaluate(()=>PetDockEditor.getSelection()),'text');
 await page.evaluate(()=>{const view=PetDockVendors.EditorView.findFromDOM(document.querySelector('.cm-editor')),Selection=view.state.selection.constructor;view.dispatch({selection:Selection.create([Selection.range(0,4),Selection.range(9,13)])});});assert.equal(await page.evaluate(()=>PetDockEditor.getSelection()),'orig\ntext');await page.evaluate(()=>{const view=PetDockVendors.EditorView.findFromDOM(document.querySelector('.cm-editor'));view.dispatch({selection:{anchor:9,head:13}});});
 const captured='  const answer = 42;\n\n// exact spacing\t';const id=await page.evaluate(text=>PetDockEditor.newFromText(text),captured);
 assert.equal(await editor.textContent(),captured.replaceAll('\n',''));assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('cm-content')),true);
 const saved=await page.evaluate(()=>saved);assert.equal(saved.editorTabs.length,2);assert.equal(saved.activeEditorTab,id);assert.equal(saved.editorTabs[1].text,captured);assert.equal(saved.editorTabs[1].dirty,true);assert.equal(saved.editorTabs[1].path,'');assert.equal(saved.editorTabs[0].text,'original text');
 await page.locator('.editor-tab').first().locator('button').first().click();assert.equal(await page.evaluate(()=>PetDockEditor.getSelection()),'text');await page.keyboard.press('Control+z');assert.equal(await editor.textContent(),'');
 const rejected=await page.evaluate(async()=>{const errors=[];for(const value of [null,'x'.repeat(100001)])try{await PetDockEditor.newFromText(value);}catch(e){errors.push(e.name);}return errors;});assert.deepEqual(rejected,['TypeError','RangeError']);assert.equal(await page.locator('.editor-tab').count(),2);assert.deepEqual(await page.evaluate(()=>errors),[]);
 console.log('PASS selection retrieval, exact new scratch text, focus, persistence, original undo and input validation');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
