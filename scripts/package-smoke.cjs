'use strict';
const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
async function workerCheck(executable, env) {
  const pipe = `\\\\.\\pipe\\petdock-${crypto.randomUUID()}`, token = crypto.randomBytes(32).toString('hex');
  let client, child, timer;
  const server = net.createServer();
  try {
    const output = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Packaged worker output timed out')), 15000);
      server.on('connection', socket => {
        client = socket; let buffer = '', text = '';
        socket.setEncoding('utf8');
        socket.on('data', chunk => {
          buffer += chunk; let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const item = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end+1);
            if (item.token) {
              if (item.token !== token) { reject(new Error('Bad worker token')); return; }
              socket.write(JSON.stringify({ event: 'start', config: { shell: 'powershell', cwd: process.cwd() } })+'\n');
            }
            if (item.event === 'ready') socket.write(JSON.stringify({ event: 'write', data: "Write-Output ('PETDOCK_WORKER_' + (6*7))\r" })+'\n');
            if (item.event === 'data') { text += item.data; if (text.includes('PETDOCK_WORKER_42')) resolve(); }
            if (item.event === 'error') reject(new Error(item.data));
          }
        });
      });
    });
    await new Promise(resolve => server.listen(pipe, resolve));
    child = spawn(executable, ['--terminal-worker', pipe, token], { env, windowsHide: true, stdio: 'ignore' });
    await output;
  } finally { clearTimeout(timer); client?.destroy(); server.close(); child?.kill(); }
}
(async () => {
  const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts');
  const executable = path.join(root, 'dist/Ogle-win32-x64/Ogle.exe');
  const profile=path.join(out,`package-profile-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoExpand:false}));
  const env = { ...process.env, PETDOCK_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: executable, args: [], env });
  const report = {};
  try {
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => document.querySelector('#status-dot').classList.contains('ready'), null, { timeout: 60000 });
    assert.equal(await page.locator('[data-shell],#minimize,#close').count(),0);
    await page.locator('[data-panel="shortcuts"]').evaluate(el=>el.click());
    await page.locator('#shortcuts-panel').getByRole('button',{name:'＋ Add',exact:true}).click();
    assert.equal(await page.getByLabel('Path or URL',{exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('button',{name:'Choose file or folder…',exact:true}).isVisible(),true);
    report.unifiedLinksAdd=true;
    await page.locator('[data-panel="terminal"]').evaluate(el => el.click());
    await page.evaluate(() => { window.testTerminalOutput = ''; window.dock.onEvent(event => { if (event.type === 'terminal' && event.event === 'data') window.testTerminalOutput += event.data; }); });
    await page.locator('#terminal-panel').getByRole('button',{name:'+ PowerShell',exact:true}).click();
    await page.locator('.terminal-tabs button').first().waitFor();
    await page.locator('.terminal-session:not([hidden]) .xterm-helper-textarea').focus();
    await page.keyboard.type("Write-Output ('PETDOCK_PACKAGE_' + (6*7))");
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.testTerminalOutput.includes('PETDOCK_PACKAGE_42'), null, { timeout: 15000 });
    await page.screenshot({ path: path.join(out, 'package-terminal.png') });
    report.powerShellPanelButton = true;
    await page.locator('#terminal-panel').getByRole('button', {name:'Close session',exact:true}).click();
    await page.locator('#terminal-panel').getByRole('button',{name:'+ CMD',exact:true}).click();
    await page.locator('.terminal-tabs button').first().waitFor();
    report.cmdPanelButton = true;
    await page.locator('#collapse').evaluate(el => el.click());
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, 'package-compact.png') });
    assert.deepEqual(errors, []);
    report.rendererErrors = errors;
  } finally { await app.close(); }
  await workerCheck(executable, env);
  report.packagedWorkerRoundtrip = true; report.elevatedUacTested = false; report.at = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'package-smoke.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
