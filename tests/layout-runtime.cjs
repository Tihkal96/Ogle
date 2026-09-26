'use strict';
// Manual Electron integration check. Never opens the user's PetDock profile or sends prompts.
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'artifacts');
  fs.mkdirSync(output, { recursive: true });
  const env = { ...process.env, PETDOCK_DATA_DIR: path.join(output, 'layout-profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof window.dock?.chatgptLayout === 'function');
    await page.waitForFunction(() => {
      const canvas = document.getElementById('pet');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    }, null, { timeout: 60000 });
    // Stub only OS launching: exercising the real pet handler and validated IPC.
    await app.evaluate(({ shell }) => {
      global.__layoutOpenedURLs = [];
      shell.openExternal = async url => { global.__layoutOpenedURLs.push(url); };
    });
    const snapshot = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({
      id: w.id, title: w.getTitle(), bounds: w.getBounds(), contentSize: w.getContentSize(),
      views: w.contentView.children.map(v => ({ bounds: v.getBounds(), visible: v.getVisible(), url: v.webContents?.getURL() }))
    })));
    const capture = async name => {
      const data = await app.evaluate(async ({ BrowserWindow, desktopCapturer }) => {
        const win = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'PetDock');
        const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1520, height: 1640 } });
        const source = sources.find(s => s.id === win.getMediaSourceId());
        return source?.thumbnail.toPNG().toString('base64');
      });
      assert.ok(data, 'Native dock window capture is available');
      fs.writeFileSync(path.join(output, `layout-${name}.png`), Buffer.from(data, 'base64'));
    };
    // DOM clicks avoid the test cursor itself triggering hover expansion.
    if (!(await page.locator('body').getAttribute('class')).includes('collapsed')) await page.locator('#collapse').evaluate(el => el.click());
    await page.waitForFunction(() => document.body.classList.contains('collapsed'));
    await page.waitForTimeout(200);
    const collapsed = await snapshot();
    assert.equal(collapsed.length, 1);
    assert.ok(collapsed[0].bounds.height <= 200);
    await capture('collapsed');
    await page.locator('[data-panel="chats"]').evaluate(el => el.click());
    await page.waitForFunction(() => !document.body.classList.contains('collapsed'));
    await page.waitForTimeout(250);
    const expanded = await snapshot();
    assert.ok(expanded[0].bounds.height > collapsed[0].bounds.height);
    await capture('expanded');
    await page.locator('#pet').evaluate(el => el.click());
    await page.waitForTimeout(100);
    const launched = await app.evaluate(() => global.__layoutOpenedURLs);
    assert.ok(launched.some(url => /^codex:\/\//.test(url)), 'Pet click reaches openCodex IPC');
    await page.locator('[data-panel="chatgpt"]').evaluate(el => el.click());
    await page.waitForFunction(() => !document.getElementById('chatgpt-panel').hidden);
    await page.waitForTimeout(1200);
    let embedded = await snapshot();
    assert.equal(embedded.length, 1, 'ChatGPT does not create another normal window');
    assert.equal(embedded[0].views.length, 1);
    const remote = embedded[0].views[0];
    assert.equal(remote.visible, true);
    assert.ok(remote.bounds.width > 200 && remote.bounds.height > 100);
    assert.ok(remote.bounds.x >= 0 && remote.bounds.y >= 0);
    assert.ok(remote.bounds.x + remote.bounds.width <= embedded[0].contentSize[0]);
    assert.ok(remote.bounds.y + remote.bounds.height <= embedded[0].contentSize[1]);
    await page.waitForTimeout(4000);
    embedded = await snapshot();
    await capture('chatgpt-embedded');
    await page.locator('[data-panel="notes"]').evaluate(el => el.click());
    await page.waitForTimeout(250);
    assert.equal((await snapshot())[0].views[0].visible, false, 'Notes hides remote content');
    await page.locator('[data-panel="chatgpt"]').evaluate(el => el.click());
    await page.waitForTimeout(250);
    await page.locator('#collapse').evaluate(el => el.click());
    await page.waitForTimeout(250);
    assert.equal((await snapshot())[0].views[0].visible, false, 'Collapse hides remote content');
    assert.deepEqual(errors, []);
    const report = { at: new Date().toISOString(), collapsed, expanded, embedded, petOpensCodex: true, hiddenOnNotes: true, hiddenOnCollapse: true, rendererErrors: errors, profile: 'artifacts/layout-profile', authentication: 'Not attempted; existing signed-in profile untouched.' };
    fs.writeFileSync(path.join(output, 'layout-runtime.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
