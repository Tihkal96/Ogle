'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const fixture = path.join(root, 'artifacts', `chatgpt-interaction-${Date.now()}`);
  fs.mkdirSync(fixture, { recursive: true });
  const entry = path.join(fixture, 'main.cjs');
  fs.writeFileSync(entry, `
    const {app,BrowserWindow}=require('electron');
    const {ChatGPTPanel}=require(${JSON.stringify(path.join(root, 'src/main/chatgpt-panel.cjs'))});
    app.setPath('userData',${JSON.stringify(path.join(fixture, 'profile'))});
    app.whenReady().then(async()=>{
      const win=new BrowserWindow({width:600,height:400,webPreferences:{sandbox:true}});
      await win.loadURL('about:blank');
      global.interactions=[];
      global.panel=new ChatGPTPanel({parent:win,onInteraction:(...args)=>global.interactions.push(args)});
      panel.ensureView();
      await panel.view.webContents.loadURL('about:blank');
      await panel.view.webContents.executeJavaScript("document.body.innerHTML='<textarea autofocus></textarea>';document.querySelector('textarea').focus()");
      panel.layout({visible:true,bounds:{x:0,y:0,width:600,height:400}});
      win.show();panel.view.webContents.focus();
      global.fixtureReady=true;
    });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [entry], env });
  try {
    await app.firstWindow();
    for (let i = 0; i < 100 && !(await app.evaluate(() => global.fixtureReady === true)); i++) await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(await app.evaluate(() => global.fixtureReady), true);
    const result = await app.evaluate(async () => {
      const contents = global.panel.view.webContents;
      const pause = () => new Promise(resolve => setTimeout(resolve, 150));
      const count = () => global.interactions.length;
      const initial = count();
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'A' });
      contents.sendInputEvent({ type: 'char', keyCode: 'a' });
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'A' });
      await pause();
      const keyboard = count() - initial;
      const beforeMouse = count();
      contents.sendInputEvent({ type: 'mouseMove', x: 20, y: 20 });
      contents.sendInputEvent({ type: 'mouseDown', x: 20, y: 20, button: 'left', clickCount: 1 });
      contents.sendInputEvent({ type: 'mouseUp', x: 20, y: 20, button: 'left', clickCount: 1 });
      await pause();
      const mouse = count() - beforeMouse;
      global.panel.hide();
      const beforeHidden = count();
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'B' });
      contents.sendInputEvent({ type: 'mouseMove', x: 25, y: 25 });
      await pause();
      return { keyboard, mouse, hidden: count() - beforeHidden, noPayload: global.interactions.every(args => args.length === 0) };
    });
    assert.ok(result.keyboard > 0, 'Native keyboard input must signal interaction');
    assert.ok(result.mouse > 0, 'Native mouse input must signal interaction');
    assert.equal(result.hidden, 0, 'Hidden view must not signal interaction');
    assert.equal(result.noPayload, true, 'Interaction must carry no user input');
    console.log(JSON.stringify(result));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
