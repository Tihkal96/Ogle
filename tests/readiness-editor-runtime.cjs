'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const root=path.resolve(__dirname,'..'), dir=path.join(root,'artifacts',`readiness-editor-${Date.now()}`);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:800,height:600,show:false});w.loadFile(${JSON.stringify(path.join(dir,'fixture.html'))});});`);
  const url=file=>'file:///'+path.join(root,file).replaceAll('\\','/');
  fs.writeFileSync(path.join(dir,'fixture.html'),`<div id="editor"></div><script src="${url('src/renderer/vendor/bundle.js')}"></script><script src="${url('src/renderer/autosave.js')}"></script><script src="${url('src/renderer/editor.js')}"></script><script>window.errors=[];PetDockEditor.mount(document.querySelector('#editor'),{editorSave:async()=>({path:'test.js',name:'test.js'})},{editorTabs:[]},async()=>{},e=>errors.push(String(e)));</script>`);
  require('node:child_process').execFileSync(process.execPath,['--check',path.join(dir,'main.cjs')]);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[path.join(dir,'main.cjs')],env});
  try {
    const page=await app.firstWindow(), editor=page.locator('.cm-content');await editor.waitFor();await editor.fill('alpha beta');await page.keyboard.press('Control+End');await page.keyboard.press('Shift+ArrowLeft');
    await page.getByRole('button',{name:'New tab',exact:true}).click();await editor.fill('second');
    await page.locator('.editor-tab').first().locator('button').first().click();
    assert.equal(await page.evaluate(()=>getSelection().toString()),'a','Tab switching must preserve selection');
    await page.keyboard.press('Control+z');assert.equal(await editor.textContent(),'','Tab switching must preserve undo');
    await editor.fill('language change');await page.locator('.editor-language').selectOption('javascript');await page.keyboard.press('Control+z');assert.equal(await editor.textContent(),'','Language change must preserve undo');
    await editor.fill('save change');await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('.editor-tab.active').textContent.includes('test.js'));await page.keyboard.press('Control+z');assert.equal(await editor.textContent(),'','Saving must preserve undo');
    assert.deepEqual(await page.evaluate(()=>errors),[]);console.log('PASS editor preserves selection and undo through tab changes, language changes, and saves');
  } finally {await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
