'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = path.join(root, 'artifacts', `links-groups-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ autoStart: false, autoExpand: false, compactChatTarget: 'codex', linksLayoutVersion: 2, shortcutsView: 'details', shortcuts: [
    { id: 'group', name: 'Tools', kind: 'group', parentId: null },
    { id: 'child', name: 'Example', kind: 'url', path: 'https://example.com', parentId: 'group' },
    { id: 'nested', name: 'Nested', kind: 'group', parentId: 'group' },
    { id: 'nested-child', name: 'Nested example', kind: 'url', path: 'https://example.org', parentId: 'nested' }
  ] }));
  const env = { ...process.env, PETDOCK_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch(process.env.PETDOCK_TEST_EXE ? { executablePath: process.env.PETDOCK_TEST_EXE, args: [], env } : { args: [root], env });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow, screen }) => { BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false); screen.getCursorScreenPoint = () => ({ x: -9999, y: -9999 }); });
    await page.waitForFunction(() => typeof state !== 'undefined' && state.settings.autoExpand === false && !DockLayoutTransition.busy);
    await page.evaluate(() => switchPanel('shortcuts'));
    await page.locator('.links-details').waitFor();
    assert.equal(await page.locator('select[aria-label="Add links to"]').count(), 0);
    assert.equal(await page.locator('.links-navigation').isHidden(), true);
    assert.equal(await page.locator('.links-pin-status').isHidden(), true);
    for (const id of ['group', 'nested']) {
      const bounds = await page.locator(`.links-group[data-id="${id}"]`).evaluate(el => {
        const group = el.getBoundingClientRect(), children = el.querySelector(':scope > .links-children').getBoundingClientRect();
        return { framed: getComputedStyle(el).borderTopWidth !== '0px', contains: children.left >= group.left && children.right <= group.right && children.bottom <= group.bottom };
      });
      assert.ok(bounds.framed && bounds.contains, `${id} visibly contains its children`);
    }
    await page.locator('.links-group[data-id="group"] > .links-row > .links-open').click();
    assert.equal(await page.locator('.links-content > .links-entry').count(), 2);
    await page.getByRole('button', { name: 'Add group', exact: true }).click();
    await page.getByRole('textbox', { name: 'Group name', exact: true }).fill('Added inside');
    await page.getByRole('button', { name: 'Create group', exact: true }).click();
    await page.waitForFunction(() => state.settings.shortcuts.some(item => item.name === 'Added inside' && item.parentId === 'group'));
    await page.getByRole('button', { name: 'Back to all links', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle link view', exact: true }).click();
    assert.equal(await page.locator('.links-icons > .links-entry').count(), 1);
    assert.equal(await page.locator('.links-group-icon > span').count(), 3);
    await page.screenshot({ path: path.join(root, 'artifacts/links-groups-compact.png') });
    console.log('Links compact controls, nested group frames, navigation, and current-group creation passed');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

