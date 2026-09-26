'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="pinned-links"></div><section id="links"></section>');
    await page.addScriptTag({ path: path.resolve(__dirname, '../src/renderer/shortcuts.js') });
    await page.evaluate(() => {
      window.saved = { shortcuts: [
        { id: 'one', name: 'Original', path: 'https://example.com', kind: 'url' },
        { id: 'group', name: 'Group', kind: 'group' },
        { id: 'child', name: 'Child', path: 'https://example.org', kind: 'url', parentId: 'group' }
      ], shortcutsView: 'details' };
      window.failures = [];
      PetDockShortcuts.mount(document.querySelector('#links'), { openShortcut: async () => {} }, saved,
        async change => { window.saved = structuredClone(change); }, error => failures.push(error.message));
    });
    const edit = page.locator('[data-id="one"] button[title="Rename or edit target"]');
    const form = page.locator('.links-form');
    await edit.click();
    await form.getByLabel('Display name', { exact: true }).fill('Discard this');
    await form.getByLabel('Target path or URL').click();
    assert.equal(await form.isVisible(), true, 'moving between form inputs must preserve edits');
    await page.getByLabel('Toggle link view').click();
    assert.equal(await form.isVisible(), false);
    assert.equal(await page.evaluate(() => saved.shortcuts[0].name), 'Original');
    await edit.click();
    await form.getByLabel('Display name', { exact: true }).fill('Escape draft');
    await page.keyboard.press('Escape');
    assert.equal(await form.isVisible(), false);
    assert.equal(await form.locator('input').count(), 0);
    await edit.click();
    await form.getByLabel('Display name', { exact: true }).fill('Saved alias');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => saved.shortcuts[0].name === 'Saved alias');
    await edit.click();
    await form.getByLabel('Display name', { exact: true }).fill('Collapse draft');
    await page.evaluate(() => PetDockShortcuts.discardEdit());
    assert.equal(await form.isVisible(), false);
    assert.equal(await page.evaluate(() => saved.shortcuts[0].name), 'Saved alias');
    await page.locator('[data-id="one"] button[title="Remove link"]').click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.evaluate(() => saved.shortcuts.length), 3);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    assert.equal(await dialog.isVisible(), false);
    await page.locator('[data-id="one"] button[title="Remove link"]').click();
    await page.evaluate(() => PetDockShortcuts.discardEdit());
    assert.equal(await dialog.isVisible(), false, 'leaving panel closes removal confirmation');
    await page.locator('[data-id="one"] button[title="Remove link"]').click();
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.waitForFunction(() => saved.shortcuts.length === 2);
    await page.locator('[data-id="group"] button[title^="Remove group"]').click();
    assert.match(await dialog.innerText(), /links will be kept in the parent group/);
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.waitForFunction(() => saved.shortcuts.length === 1);
    assert.deepEqual(await page.evaluate(() => ({ id: saved.shortcuts[0].id, parentId: saved.shortcuts[0].parentId })), { id: 'child', parentId: null });
    assert.deepEqual(await page.evaluate(() => failures), []);
    console.log('Links confirmation, group preservation, explicit Save, Escape and lifecycle discard passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
