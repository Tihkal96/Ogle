const { _electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const root = path.resolve(__dirname, '..');
  const env = { ...process.env, PETDOCK_DATA_DIR: path.join(root, 'artifacts/chatgpt-debug-profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ args: [root], env });
  try {
    const page = await app.firstWindow();
    await page.locator('#chatgpt').click();
    await page.waitForTimeout(12000);
    console.log(JSON.stringify(await app.evaluate(async ({ BrowserWindow, webContents }) => {
      const windows = BrowserWindow.getAllWindows().map(w => ({ id: w.id, title: w.getTitle(), bounds: w.getBounds(), children: w.contentView.children.map(v => ({ bounds: v.getBounds(), visible: v.getVisible(), id: v.webContents?.id })) }));
      const contents = webContents.getAllWebContents().map(w => ({ id: w.id, url: w.getURL(), loading: w.isLoading(), type: w.getType() }));
      return { windows, contents };
    }), null, 2));
    const shots = await app.evaluate(async ({ BrowserWindow, webContents, desktopCapturer }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.getTitle().includes('ChatGPT'));
      const remote = webContents.getAllWebContents().find(w => w.getURL().startsWith('https://'));
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1280, height: 1520 } });
      const source = sources.find(s => s.name === 'ChatGPT · PetDock');
      return { native: source?.thumbnail.toPNG().toString('base64'), win: win && (await win.capturePage()).toPNG().toString('base64'), remote: remote && (await remote.capturePage()).toPNG().toString('base64') };
    });
    for (const [key, data] of Object.entries(shots)) if (data) fs.writeFileSync(path.join(root, `artifacts/chatgpt-debug-${key}.png`), Buffer.from(data, 'base64'));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

