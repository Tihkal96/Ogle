'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { CodexBridge } = require('../src/main/codex-bridge.cjs');

const ROOT = path.resolve(__dirname, '..');
const SMOKE_THREAD = process.env.PETDOCK_SMOKE_THREAD_ID?.trim();
async function main() {
  assert.ok(SMOKE_THREAD, 'Set PETDOCK_SMOKE_THREAD_ID to an explicitly authorized smoke-test task before running this test. --real-send requires that task to be idle.');
  const output = path.join(ROOT, 'artifacts'); fs.mkdirSync(output, { recursive: true });
  const profile = path.join(output, `attachments-profile-${Date.now()}`); fs.mkdirSync(profile);
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ lastThreadId: SMOKE_THREAD, autoExpand: false }));
  const env = { ...process.env, PETDOCK_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [ROOT], env });
  let imageUrl;
  try {
    const page = await app.firstWindow(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.PetDockAttachments && document.querySelector('#status-dot')?.classList.contains('ready'), null, { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('#pin-thread').disabled && document.querySelector('#activity').textContent !== 'Loading conversation…');
    await page.locator('[data-panel="chats"]').evaluate(element => element.click());
    await page.waitForFunction(() => !document.body.classList.contains('collapsed'));
    const paste = async color => {
      const url = await page.evaluate(async color => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
        const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 96, 96);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'synthetic-square.png', { type: 'image/png' }));
        document.querySelector('#prompt').dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
        return canvas.toDataURL('image/png');
      }, color);
      await page.waitForFunction(() => !window.PetDockAttachments.isBusy());
      return url;
    };
    imageUrl = await paste('#0000ff');
    assert.equal(await page.locator('.attachment-previews img').count(), 1);
    assert.equal(await page.evaluate(() => window.PetDockAttachments.getInputs()[0].url), imageUrl);
    // Context changes preserve each task's unsent attachment state.
    await page.evaluate(() => window.PetDockAttachments.setContext('attachment-context-test'));
    assert.equal(await page.evaluate(() => window.PetDockAttachments.hasImages()), false);
    await paste('#ff0000');
    await page.evaluate(id => window.PetDockAttachments.setContext(id), SMOKE_THREAD);
    assert.equal(await page.evaluate(() => window.PetDockAttachments.getInputs()[0].url), imageUrl);
    await page.getByRole('button', { name: 'Remove image 1', exact: true }).click();
    assert.equal(await page.evaluate(() => window.PetDockAttachments.hasImages()), false);
    await paste('#0000ff');
    await page.evaluate(() => { window.__sentAttachmentSnapshot = window.PetDockAttachments.getInputs(); });
    await paste('#00ff00');
    await page.evaluate(id => window.PetDockAttachments.clear(id, window.__sentAttachmentSnapshot), SMOKE_THREAD);
    assert.equal(await page.locator('.attachment-previews img').count(), 1, 'Snapshot clear must preserve newly pasted images');
    await page.screenshot({ path: path.join(output, 'attachment-preview.png') });
    await app.evaluate((_electron, root) => {
      const { CodexBridge } = process.mainModule.require(`${root}/src/main/codex-bridge.cjs`);
      globalThis.__originalImageSend = CodexBridge.prototype.sendTurn;
      globalThis.__imageIpcCalls = [];
      CodexBridge.prototype.sendTurn = async function (id, text, images) { globalThis.__imageIpcCalls.push({ id, text, images }); return { turn: { id: 'synthetic-attachment-test', status: 'completed' } }; };
    }, ROOT.replace(/\\/g, '/'));
    await page.locator('#prompt').fill('');
    await page.waitForFunction(() => !document.querySelector('#send').disabled);
    await page.locator('#send').click();
    await page.waitForFunction(() => !window.PetDockAttachments.hasImages());
    const calls = await app.evaluate(() => globalThis.__imageIpcCalls);
    assert.equal(calls.length, 1); assert.equal(calls[0].id, SMOKE_THREAD); assert.equal(calls[0].text, '');
    assert.equal(calls[0].images.length, 1); assert.equal(calls[0].images[0].type, 'image'); assert.match(calls[0].images[0].url, /^data:image\/png;base64,/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ clipboardPreview: true, removal: true, perTask: true, snapshotClear: true, imageOnlySendIpc: true, rendererErrors: errors }));
  } finally { await app.close(); }
  if (process.argv.includes('--real-send')) {
    const bridge = new CodexBridge(); let timer;
    try {
      const read = await bridge.readThread(SMOKE_THREAD);
      assert.equal(read.thread.id, SMOKE_THREAD);
      assert.equal(Boolean(read.runtime?.running), false, 'Smoke-test task must be idle before sending the synthetic image');
      const result = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Synthetic image response timed out')), 60000);
        bridge.on('notification', ({ method, params }) => {
          if (method !== 'petdock/threadState' || params.thread?.id !== SMOKE_THREAD) return;
          const last = params.thread.turns.at(-1);
          if (last?.status !== 'completed' || params.runtime.running) return;
          const user = last.items.find(item => item.type === 'userMessage');
          if (!user?.content?.some(input => input.text?.includes('PETDOCK_IMAGE_SMOKE'))) return;
          resolve(last.items.filter(item => item.type === 'agentMessage').map(item => item.text).join(''));
        });
      });
      await bridge.sendTurn(SMOKE_THREAD, 'PETDOCK_IMAGE_SMOKE: What solid color is the attached square? Reply with exactly BLUE if it is blue, or the actual color otherwise. Do not use tools or change files.', [{ type: 'image', url: imageUrl }]);
      const text = await result; assert.equal(text.trim(), 'BLUE');
      console.log(JSON.stringify({ realDesktopImageReply: text, task: SMOKE_THREAD, syntheticImageOnly: true }));
    } finally { clearTimeout(timer); bridge.close(); }
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
