'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts');
  const profile = path.join(out, `editor-links-profile-${Date.now()}`), fixture = path.join(profile, 'folder');
  fs.mkdirSync(fixture, { recursive: true }); fs.writeFileSync(path.join(fixture, 'example.json'), '{"test":true}');
  const cmd = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/cmd.exe');
  const settingsFile = path.join(profile, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ autoExpand: false, linksLayoutVersion: 2, shortcutsView: 'icons',
    editorTabs: [{ id: 'completion-test', name: 'Completion.js', language: 'javascript', text: 'const mySpecialValue = 42;\nmySpe', path: '', dirty: true }], activeEditorTab: 'completion-test',
    shortcuts: [
      { id: 'group-a', name: 'Utilities', kind: 'group', path: null, parentId: null },
      { id: 'group-b', name: 'Documents', kind: 'group', path: null, parentId: 'group-a' },
      { id: 'cmd-link', name: 'Command Prompt', kind: 'file', path: cmd, parentId: 'group-a' },
      { id: 'json-link', name: 'Example JSON', kind: 'file', path: path.join(fixture, 'example.json'), parentId: 'group-b' },
      { id: 'folder-link', name: 'Test folder', kind: 'folder', path: fixture, parentId: null }
    ] }));
  const env = { ...process.env, PETDOCK_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  try {
    const page = await app.firstWindow(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.locator('.links-content').waitFor({ state: 'attached', timeout: 60000 });
    await page.locator('[data-panel="editor"]').evaluate(element => element.click());
    await page.waitForFunction(() => !document.body.classList.contains('collapsed'));
    await page.evaluate(() => {
      const { EditorView, startCompletion } = window.PetDockVendors;
      const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
      view.dispatch({ selection: { anchor: view.state.doc.length } }); view.focus(); startCompletion(view);
    });
    await page.locator('.cm-tooltip-autocomplete').waitFor();
    await page.waitForTimeout(120);
    assert.match(await page.locator('.cm-tooltip-autocomplete').textContent(), /mySpecialValue/);
    await page.keyboard.press('Tab');
    const completed = await page.evaluate(() => {
      const view = window.PetDockVendors.EditorView.findFromDOM(document.querySelector('.cm-editor'));
      return { text: view.state.doc.toString(), focused: view.hasFocus };
    });
    assert.equal(completed.text, 'const mySpecialValue = 42;\nmySpecialValue'); assert.equal(completed.focused, true);
    await page.keyboard.press('Tab');
    assert.match(await page.locator('.cm-content').innerText(), /\n\s+mySpecialValue/);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => window.PetDockVendors.EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString()), completed.text);

    await page.locator('[data-panel="shortcuts"]').click();
    assert.equal(await page.locator('.links-entry[data-id="group-b"]').count(), 0, 'Nested groups must not render inline in icon mode');
    await page.locator('.links-entry[data-id="group-a"] .links-open').click();
    assert.equal(await page.locator('.links-entry[data-id="group-a"]').count(), 0);
    assert.equal(await page.locator('.links-entry[data-id="group-b"]').count(), 1);
    assert.equal(await page.locator('.links-children').count(), 0);
    await page.locator('.links-entry[data-id="cmd-link"] .links-icon img').waitFor({ timeout: 10000 });
    assert.match(await page.locator('.links-entry[data-id="cmd-link"] .links-icon img').getAttribute('src'), /^data:image\//);
    await page.screenshot({ path: path.join(out, 'links-icon-folder.png') });
    await page.locator('.links-entry[data-id="group-b"] .links-open').click();
    assert.equal(await page.locator('.links-entry[data-id="json-link"]').count(), 1);
    await page.getByRole('button', { name: '← Back', exact: true }).click();
    assert.equal(await page.locator('.links-entry[data-id="cmd-link"]').count(), 1);
    await page.getByRole('button', { name: 'All links', exact: true }).click();
    await page.locator('.links-entry[data-id="folder-link"] .links-open').click();
    assert.equal(await page.getByRole('button', { name: 'Open in Explorer ↗', exact: true }).count(), 1);
    assert.match(await page.locator('.links-content').innerText(), /example.json/);
    assert.equal(await page.locator('.links-content .links-entry-actions').count(), 0, 'Filesystem entries must not expose shortcut deletion');
    await page.getByRole('button', { name: 'All links', exact: true }).click();
    await page.getByLabel('Toggle link view').click();
    assert.equal(await page.locator('.links-children').count(), 2, 'Details mode retains optional tree');

    await page.locator('[data-panel="terminal"]').click();
    assert.equal(await page.locator('#terminal-panel').getByRole('button', { name: 'Release admin access', exact: true }).count(), 0);
    assert.equal(await page.locator('.terminal-command-actions button').count(), 5);
    assert.equal(await page.locator('.terminal-command-actions').evaluate(element => getComputedStyle(element).justifyContent), 'flex-end');
    await page.locator('[data-panel="settings"]').click();
    const autoStart = page.locator('[data-setting="autoStart"]'); assert.equal(await autoStart.isChecked(), true);
    await autoStart.uncheck();
    await page.waitForFunction(() => document.querySelector('[data-setting="autoStart"]').checked === false);
    await page.waitForTimeout(100);
    assert.equal(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).autoStart, false);
    await page.getByRole('button', { name: 'Release admin access', exact: true }).click();
    await page.getByText('Administrator shells closed and access released.', { exact: false }).waitFor();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ tabAcceptsCompletion: true, tabKeepsFocus: true, tabIndentAndShiftTab: true, iconGroupPages: true, nestedBreadcrumbs: true, nativeExistingIcon: true, filesystemIconPage: true, optionalDetailsTree: true, shellCommandsRightAligned: true, releaseAdminInSettings: true, isolatedAutoStartToggle: true, rendererErrors: errors }));
  } finally { await app.close(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
