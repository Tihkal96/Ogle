'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { installerScript, validateConfig, PersistentAdmin, elevationWrapper } = require('../src/main/persistent-admin.cjs');
const { PersistentAdminBroker } = require('../src/main/persistent-admin-broker.cjs');
const { serveConnection } = require('../src/main/persistent-admin-worker.cjs');
const sid = 'S-1-5-21-111-222-333-1001';
const token = 'a'.repeat(64);
test('elevated installation command stays below Windows command length with long portable paths', () => {
  for (const source of ['C:\\Ogle', 'C:\\' + 'long folder name\\'.repeat(1000)]) {
    const command = elevationWrapper(installerScript({ sid, source, executable: 'Ogle.exe' }));
    assert.ok(Buffer.from(command, 'utf16le').toString('base64').length + 200 < 32767);
    assert.ok(!command.includes(source));
  }
});
test('compressed in-memory loader executes exact script without elevation or temporary executable script', { skip: process.platform !== 'win32' }, () => {
  const wrapper = elevationWrapper("Write-Output 'OGLE_LOADER_42'");
  const encoded = /-EncodedCommand ([A-Za-z0-9+/=]+)'/.exec(wrapper)[1];
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, encoding: 'utf8' });
  assert.equal(output.trim(), 'OGLE_LOADER_42');
});
test('installed helper config rejects other users, paths and malformed secrets', () => {
  const config = { version: 1, sid, token, pipe: `\\\\.\\pipe\\ogle-admin-${sid}` };
  assert.equal(validateConfig(config, sid), config);
  for (const changed of [{ sid: 'S-1-5-21-111-222-333-1002' }, { token: 'a' }, { pipe: '\\\\.\\pipe\\other' }, { version: 2 }]) assert.throws(() => validateConfig({ ...config, ...changed }, sid), /Invalid installed/);
});
test('source builds cannot request persistent privileged installation', async () => {
  let calls = 0;
  const installation = new PersistentAdmin({ execute: async () => { calls++; } });
  assert.deepEqual(await installation.status(), { available: false, enabled: false });
  await assert.rejects(installation.enable(), /packaged/); assert.equal(calls, 0);
});

test('standard-account status explains session fallback without requesting elevation', async () => {
  const installation = new PersistentAdmin({ packaged: true, execute: async (script, elevated) => {
    assert.equal(elevated, undefined);
    return 'False';
  } });
  installation.config = async () => null;
  assert.deepEqual(await installation.status(), { available: false, enabled: false, reason: 'standard-account' });
  await assert.rejects(installation.enable(), /Admin shells can still request Windows approval/);
});

test('unreadable account membership fails explicitly instead of selecting an elevation route', async () => {
  const installation = new PersistentAdmin({ packaged: true, execute: async () => '' });
  await assert.rejects(installation.canPersist(), /Could not check Windows/);
});
test('installation and removal scripts parse, use protected fixed executable and reject untrusted identifiers', { skip: process.platform !== 'win32' }, () => {
  assert.throws(() => installerScript({ sid: "bad';Remove-Item", source: 'x', executable: 'Ogle.exe' }), /Invalid/);
  assert.throws(() => installerScript({ sid, source: 'x', executable: '../Ogle.exe' }), /Invalid/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogle-admin-parser-'));
  try {
    for (const remove of [false, true]) {
      const script = installerScript({ sid, source: "C:\\A user's folder\\Ogle", executable: 'Ogle.exe', remove });
      assert.match(script, /GetFolderPath\('ProgramFiles'\)/);
      assert.match(script, /ReparsePoint/);
      if (!remove) {
        assert.match(script, /Set-Acl -LiteralPath \$target/);
        assert.match(script, /-Argument '--persistent-terminal-worker'/);
        assert.match(script, /-RunLevel Highest/);
        assert.ok(script.indexOf('Set-Acl -LiteralPath $target') < script.indexOf('Copy-Item -Destination'));
      } else {
        assert.match(script, /WaitForExit\(10000\)/);
        assert.match(script, /\$attempt -lt 12/);
        assert.ok(script.indexOf('Disable-ScheduledTask') < script.indexOf('Stop-Process'));
        assert.ok(script.indexOf('WaitForExit') < script.indexOf('Remove-Item'));
        assert.ok(script.indexOf('Remove-Item') < script.indexOf('Unregister-ScheduledTask'));
      }
      const filename = path.join(dir, `script-${remove}.ps1`); fs.writeFileSync(filename, script);
      const command = `$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${filename.replace(/'/g, "''")}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{$_.Message};exit 1}`;
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true });
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('authenticated installed helper is reusable after dock restart and disconnect closes shells', { skip: process.platform !== 'win32', timeout: 7000 }, async () => {
  const pipe = `\\\\.\\pipe\\ogle-admin-test-${crypto.randomUUID()}`;
  let starts = 0, killed = 0, writes = [], taskRuns = 0;
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    serveConnection(socket, token, () => {
      starts++; let onExit;
      return { onData() {}, onExit(callback) { onExit = callback; }, write(text) { writes.push(text); }, resize() {}, kill() { killed++; onExit?.({ exitCode: 0 }); } };
    });
  });
  await new Promise(resolve => server.listen(pipe, resolve));
  const installation = { async start() { taskRuns++; return { pipe, token }; } };
  const first = new PersistentAdminBroker({ installation, onEvent() {} });
  const second = new PersistentAdminBroker({ installation, onEvent() {} });
  try {
    const bad = net.connect(pipe); bad.on('error', () => {});
    await new Promise(resolve => { bad.on('connect', () => bad.write(JSON.stringify({ token: 'b'.repeat(64), event: 'start', id: 'attack', config: { shell: 'cmd', cwd: os.tmpdir() } }) + '\n')); bad.on('close', resolve); });
    assert.equal(starts, 0);
    await first.create('shell-one', { shell: 'cmd', cwd: os.tmpdir() });
    first.send({ event: 'write', id: 'shell-one', data: 'echo first' });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(writes, ['echo first']);
    first.dispose(); await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(killed, 1);
    await second.create('shell-two', { shell: 'powershell', cwd: os.tmpdir() });
    assert.equal(starts, 2); assert.equal(taskRuns, 2); assert.ok(server.listening);
  } finally { first.dispose(); second.dispose(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
});
test('closing dock during helper setup cancels pending connection', async () => {
  let finish;
  const broker = new PersistentAdminBroker({ installation: { start: () => new Promise(resolve => { finish = resolve; }) }, onEvent() {} });
  const promise = broker.connect(); broker.dispose(); finish({ pipe: 'never-connected', token });
  await assert.rejects(promise, /cancelled/); assert.equal(broker.socket, null);
});
test('encrypted persistent transport exchanges real CMD output without elevation', { skip: process.platform !== 'win32', timeout: 7000 }, async () => {
  const pipe = `\\\\.\\pipe\\ogle-admin-test-${crypto.randomUUID()}`, sockets = new Set();
  const server = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); serveConnection(socket, token); });
  await new Promise(resolve => server.listen(pipe, resolve));
  let output = '', done;
  const received = new Promise(resolve => { done = resolve; });
  const broker = new PersistentAdminBroker({ installation: { async start() { return { pipe, token }; } }, onEvent(event) { if (event.event === 'data') { output += event.data; if (output.includes('OGLE_ENCRYPTED_42')) done(); } } });
  try {
    await broker.create('actual-cmd', { shell: 'cmd', cwd: os.tmpdir() });
    broker.send({ event: 'write', id: 'actual-cmd', data: '@echo OGLE_ENCRYPTED_42\r' });
    await received; assert.match(output, /OGLE_ENCRYPTED_42/);
  } finally { broker.dispose(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
});
