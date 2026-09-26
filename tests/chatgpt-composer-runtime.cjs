'use strict';
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = `<!doctype html><html><body><form><div id="prompt-textarea" contenteditable="true" style="min-height:40px"></div><input type="file" multiple><div id="files"></div><button type="button" data-testid="send-button" disabled>Send</button></form><script>
const editor=document.querySelector('#prompt-textarea'),send=document.querySelector('button'),files=document.querySelector('#files');window.sent=[];
const mode=location.pathname.split('/').pop();if(mode==='draft')editor.innerText='Existing draft';if(mode==='busy'){const stop=document.createElement('button');stop.dataset.testid='stop-button';document.body.append(stop);}if(mode==='history'){const old=document.createElement('article');old.innerHTML='<div data-testid="attachment">prior-notes.txt</div>';document.body.prepend(old);}
editor.addEventListener('input',()=>send.disabled=!editor.innerText.trim()&&!files.children.length);
async function attach(incoming){for(const file of incoming){const item=document.createElement('div');item.dataset.testid='attachment';if(mode==='image'){const image=document.createElement('img');image.alt=file.name;item.append(image);}else item.textContent=file.name;item.dataset.name=file.name;item.dataset.content=await file.text();files.append(item);}send.disabled=false;}
document.querySelector('input').addEventListener('change',event=>attach(event.target.files));
if(mode==='image'){document.querySelector('input').remove();editor.addEventListener('paste',event=>{event.preventDefault();attach(event.clipboardData.files);});}
send.onclick=()=>{window.sent.push({text:editor.innerText,files:[...files.children].map(item=>({name:item.dataset.name,content:item.dataset.content}))});if(mode!=='uncertain'){editor.innerText='';files.innerHTML='';}};
</script></body></html>`;

if (process.versions.electron) {
  const { app, BrowserWindow, session } = require('electron');
  global.fixtureSend = require('../src/main/chatgpt-composer.cjs').sendChatGPT;
  app.whenReady().then(async () => {
    const isolated = session.fromPartition(`composer-fixture-${Date.now()}`);
    await isolated.protocol.handle('https', request => new Response(new URL(request.url).hostname === 'chatgpt.com' ? html : '', { headers: { 'content-type': 'text/html' } }));
    const win = new BrowserWindow({ width: 600, height: 400, show: false, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL('https://chatgpt.com/c/text');
  });
} else {
  (async () => {
    const { _electron } = require('playwright');
    const root = path.resolve(__dirname, '..'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({ args: [__filename], env });
    try {
      const page = await app.firstWindow();
      await page.waitForURL('https://chatgpt.com/c/text');
      await page.waitForLoadState();
      const send = payload => app.evaluate(async ({ BrowserWindow }, { modulePath, payload }) => {
        for(let i=0;i<100 && BrowserWindow.getAllWindows()[0].webContents.isLoadingMainFrame();i++)await new Promise(r=>setTimeout(r,20));
        try { return await global.fixtureSend(BrowserWindow.getAllWindows()[0].webContents, payload); }
        catch (error) { return { error: error.message }; }
      }, { modulePath: path.join(root, 'src/main/chatgpt-composer.cjs'), payload });
      assert.deepEqual(await send({ text: 'A prompt with <markup> & a newline\nSecond line' }), { sent: true });
      assert.equal((await page.evaluate(() => window.sent))[0].text, 'A prompt with <markup> & a newline\nSecond line');
      await page.goto('https://chatgpt.com/c/files');
      assert.deepEqual(await send({ text: 'Read this', attachments: [{ type: 'file', name: 'notes.txt', url: 'data:text/plain;base64,aGVsbG8=' }] }), { sent: true });
      assert.deepEqual((await page.evaluate(() => window.sent))[0].files, [{ name: 'notes.txt', content: 'hello' }]);
      await page.goto('https://chatgpt.com/c/image');
      assert.deepEqual(await send({ text: '', attachments: [{ type: 'image', name: 'picture.png', url: 'data:image/png;base64,aW1hZ2U=' }] }), { sent: true });
      assert.equal((await page.evaluate(() => window.sent))[0].files[0].name, 'picture.png');
      await page.goto('https://chatgpt.com/c/history');
      assert.deepEqual(await send({ text: 'A follow-up after a previous upload' }), { sent: true });
      assert.equal(await page.locator('article [data-testid="attachment"]').innerText(), 'prior-notes.txt');
      await page.goto('https://chatgpt.com/');
      assert.deepEqual(await send({ text: 'New conversation' }), { sent: true });
      assert.equal(page.url(), 'https://chatgpt.com/');
      await page.goto('https://chatgpt.com/c/draft');
      assert.match((await send({ text: 'Do not overwrite' })).error, /unsent draft/);
      assert.equal(await page.locator('#prompt-textarea').innerText(), 'Existing draft');
      await page.goto('https://chatgpt.com/c/busy');
      assert.match((await send({ text: 'Wait' })).error, /still replying/);
      await page.goto('https://chatgpt.com/c/uncertain');
      assert.match((await send({ text: 'Single click' })).error, /did not confirm/);
      assert.equal((await page.evaluate(() => window.sent)).length, 1);
      await page.goto('https://other.example/');
      assert.match((await send({ text: 'Wrong host' })).error, /finish signing in/);
      const result = { textAndMultiline: true, documentTransfer: true, imagePasteTransfer: true, imageAltFilename: true, historyAttachmentsIgnored: true, homeNewChat: true, existingConversationPreserved: true, draftPreserved: true, busyRefused: true, uncertainSendClickedOnce: true, wrongOriginRefused: true, liveAccountUsed: false };
      fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
      fs.writeFileSync(path.join(root, 'artifacts/chatgpt-composer-runtime.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result));
    } finally { await app.close(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}



