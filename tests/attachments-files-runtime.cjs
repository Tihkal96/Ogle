'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<form id="composer"><div class="compose-row"><textarea></textarea></div></form>');
  await page.addScriptTag({path:path.resolve(__dirname,'../src/renderer/attachments.js')});
  await page.evaluate(()=>{PetDockAttachments.mount(document.getElementById('composer'));PetDockAttachments.setContext('chatgpt',{allowFiles:true});});
  await page.locator('.attachment-picker').setInputFiles({name:'sample.sql',mimeType:'text/plain',buffer:Buffer.from('SELECT 1;')});
  await page.waitForFunction(()=>!PetDockAttachments.isBusy());
  let inputs=await page.evaluate(()=>PetDockAttachments.getInputs());
  assert.equal(inputs[0].type,'file');assert.equal(inputs[0].name,'sample.sql');assert.equal(inputs[0].mimeType,'text/plain');
  assert.match(await page.locator('.attachment-previews').innerText(),/sample.sql/);
  await page.evaluate(()=>{PetDockAttachments.setContext('codex');});
  assert.equal(await page.evaluate(()=>PetDockAttachments.hasAttachments()),false);
  await page.locator('.attachment-picker').setInputFiles({name:'no.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});
  await page.waitForFunction(()=>!PetDockAttachments.isBusy());
  assert.match(await page.locator('.attachment-error').innerText(),/PNG, JPEG, or WebP/);
  assert.equal(await page.evaluate(()=>PetDockAttachments.getInputs().length),0);
  await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
   const blob=await new Promise(resolve=>canvas.toBlob(resolve));
   const transfer=new DataTransfer();transfer.items.add(new File([blob],'tiny.png',{type:'image/png'}));
   document.getElementById('composer').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:transfer}));
  });
  await page.waitForFunction(()=>!PetDockAttachments.isBusy());
  inputs=await page.evaluate(()=>PetDockAttachments.getInputs());assert.deepEqual(Object.keys(inputs[0]).sort(),['type','url']);
  await page.evaluate(()=>{PetDockAttachments.setContext('chatgpt',{allowFiles:true});const transfer=new DataTransfer();transfer.items.add(new File(['hello'],'dropped.txt',{type:'text/plain'}));document.getElementById('composer').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));});
  await page.waitForFunction(()=>!PetDockAttachments.isBusy());
  inputs=await page.evaluate(()=>PetDockAttachments.getInputs());assert.deepEqual(inputs.map(i=>i.name),['sample.sql','dropped.txt']);
  await page.evaluate(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['clipboard'],'pasted.txt',{type:'text/plain'}));document.getElementById('composer').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:transfer}));});
  await page.waitForFunction(()=>!PetDockAttachments.isBusy());assert.equal(await page.evaluate(()=>PetDockAttachments.getInputs().length),3);
  await page.locator('.attachment-picker').setInputFiles([{name:'four.txt',mimeType:'text/plain',buffer:Buffer.from('4')},{name:'five.txt',mimeType:'text/plain',buffer:Buffer.from('5')}]);
  assert.match(await page.locator('.attachment-error').innerText(),/up to 4/);
  const textPaste=await page.evaluate(()=>{const transfer=new DataTransfer();transfer.setData('text/plain','normal text');const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer});document.getElementById('composer').dispatchEvent(event);return event.defaultPrevented;});assert.equal(textPaste,false);
  console.log('Attachment file picker, clipboard, drop, context isolation, Codex image shape and count limit passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

