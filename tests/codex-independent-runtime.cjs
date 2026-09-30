'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..'), profile = path.join(root, 'artifacts', `codex-independent-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ autoStart: false, autoExpand: false, compactChatTarget: 'codex', shortcutVisibility: '', shortcutPanel: '', shortcutBar: '', shortcutChatTarget: '' }));
  const env = { ...process.env, PETDOCK_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch(process.env.PETDOCK_TEST_EXE ? { executablePath: process.env.PETDOCK_TEST_EXE, args: [], env } : { args: [root], env });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => typeof state !== 'undefined' && state.bootReady && !DockLayoutTransition.busy);
    await app.evaluate(({ app }) => {
      const { CodexBridge } = process.mainModule.require(app.getAppPath() + '/src/main/codex-bridge.cjs');
      CodexBridge.prototype.listThreads = function () {
        // Use the real bridge's disconnect/status path without closing the user's Codex.
        this.close();
        return Promise.reject(new Error('Codex is offline for this fixture'));
      };
    });
    await page.evaluate(() => dock.listThreads().catch(() => {}));
    await page.waitForFunction(() => !state.connected);
    await page.evaluate(() => switchPanel('notes'));
    await page.locator('#note').fill('Notes still work after Codex disconnects.');
    assert.equal(await page.locator('#note').inputValue(), 'Notes still work after Codex disconnects.');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => !window.isDestroyed())), true);
    console.log('Ogle window and Notes survive the real Codex bridge disconnect path.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
