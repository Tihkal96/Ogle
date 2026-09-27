'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = path.join(root, 'artifacts', `pet-library-${Date.now()}`);
  const source = path.join(profile, 'codex-pets'), petDir = path.join(source, 'runtime-pet');
  fs.mkdirSync(petDir, { recursive: true });
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ compactChatTarget: 'chatgpt', autoStart: false, autoExpand: false, shortcutVisibility: '', shortcutPanel: '', shortcutBar: '', shortcutChatTarget: '' }));
  const config = { id: 'runtime-pet', displayName: 'Runtime Pet', spriteVersionNumber: 2, spritesheetPath: 'sprite.webp' };
  fs.writeFileSync(path.join(petDir, 'pet.json'), JSON.stringify(config));
  fs.copyFileSync(path.join(root, 'assets/pets/lago-realistic/spritesheet.webp'), path.join(petDir, 'sprite.webp'));
  const env = { ...process.env, PETDOCK_DATA_DIR: profile, PETDOCK_PETS_DIR: source }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch(process.env.PETDOCK_TEST_EXE ? { executablePath: process.env.PETDOCK_TEST_EXE, args: [], env } : { args: [root], env });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => typeof api !== 'undefined' && typeof state !== 'undefined' && state.settings.compactChatTarget === 'chatgpt');
    const initial = (await page.evaluate(() => api.listPets())).find(p => p.id === 'runtime-pet');
    assert.ok(initial, 'startup copies Codex pet');
    assert.ok(fileURLToPath(initial.spriteUrl).startsWith(path.join(profile, 'pets')), 'runtime uses Ogle-owned atlas');
    fs.writeFileSync(path.join(petDir, 'pet.json'), JSON.stringify({ ...config, displayName: 'Updated Runtime Pet' }));
    const refreshed = await page.evaluate(() => api.refreshPets());
    assert.equal(refreshed.source, 'codex'); assert.equal(refreshed.updated, 1);
    assert.equal(refreshed.pets.find(p => p.id === 'runtime-pet').name, 'Updated Runtime Pet');
    fs.renameSync(source, path.join(profile, 'codex-offline'));
    const offline = await page.evaluate(() => api.refreshPets());
    assert.equal(offline.source, 'local'); assert.ok(offline.pets.some(p => p.id === 'runtime-pet'));
    const loaded = await page.evaluate(url => new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0); image.onerror = () => resolve(false); image.src = url; }), initial.spriteUrl);
    assert.equal(loaded, true, 'local versioned sprite loads without Codex source');
    console.log('Pet library startup copy, IPC refresh, offline fallback and versioned local atlas loading passed.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
