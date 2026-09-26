const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindowsTools, parseRunCommand } = require('../src/main/windows-tools.cjs');

test('Run supports quoted executables, raw arguments, environment paths and complete folder paths', async () => {
  const options = { env: { USERPROFILE: 'C:\\Users\\A Person' }, exists: async value => value === 'C:\\Users\\A Person' };
  assert.deepEqual(await parseRunCommand('  %userprofile%  ', options), { target: 'C:\\Users\\A Person', args: '' });
  assert.deepEqual(await parseRunCommand('"C:\\Program Files\\App\\app.exe" --file "a b.txt"', options),
    { target: 'C:\\Program Files\\App\\app.exe', args: '--file "a b.txt"' });
  assert.deepEqual(await parseRunCommand('cmd /k echo hello', options), { target: 'cmd', args: '/k echo hello' });
  assert.deepEqual(await parseRunCommand('https://example.org/a?q=a&b=2', options), { target: 'https://example.org/a?q=a&b=2', args: '' });
  assert.deepEqual(await parseRunCommand('ms-settings:display', options), { target: 'ms-settings:display', args: '' });
});

test('Run rejects empty, multiline and malformed quoted input', async () => {
  for (const value of ['', ' ', 'a\nb', 'a\0b', '"unclosed', '""', '"app"--bad', 'a'.repeat(8193)]) {
    await assert.rejects(parseRunCommand(value, { exists: async () => false }));
  }
});

test('Windows launcher passes user command only as encoded data and uses a hidden asynchronous helper', async () => {
  let call;
  const tools = createWindowsTools({ platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, exists: async () => false,
    execute: async (...args) => { call = args; } });
  const command = 'notepad "a $(whoami); & file.txt"';
  assert.deepEqual(await tools.runCommand(command), { launched: true });
  assert.equal(call[0], 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(call[2].windowsHide, true);
  assert.equal(call[2].timeout, 15000);
  const script = Buffer.from(call[1].at(-1), 'base64').toString('utf16le');
  assert.ok(!script.includes('whoami'));
  assert.ok(script.includes("'', 'open', 1"));
  const payload = /FromBase64String\('([^']+)'\)/.exec(script)[1];
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64').toString('utf8')),
    { target: 'notepad', args: '"a $(whoami); & file.txt"' });
});

test('Tool catalog reports availability and rejects unknown or unavailable tool IDs', async () => {
  let launches = 0;
  const tools = createWindowsTools({ platform: 'win32', env: { SystemRoot: 'C:\\Windows' },
    exists: async file => !/InetMgr|gpedit/i.test(file), execute: async () => { launches++; } });
  const catalog = await tools.listTools();
  assert.equal(catalog.find(item => item.id === 'iis').available, false);
  assert.equal(catalog.find(item => item.id === 'remote-desktop').available, true);
  assert.ok(catalog.every(item => !('target' in item)));
  await assert.rejects(tools.runTool('iis'), /not installed/);
  await assert.rejects(tools.runTool('notepad.exe'), /Choose a Windows tool/);
  await tools.runTool('components');
  assert.equal(launches, 1);
});

test('Launch failure returns useful error text without exposing the encoded invocation', async () => {
  const tools = createWindowsTools({ platform: 'win32', exists: async () => false,
    execute: async () => { throw Object.assign(new Error('EncodedCommand secret'), { stderr: 'Application not found' }); } });
  await assert.rejects(tools.runCommand('missing.exe'), { message: 'Application not found' });
});
