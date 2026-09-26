// Harmless real ShellExecute smoke: the requested child stays hidden and writes one marker.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createWindowsTools } = require('../src/main/windows-tools.cjs');

async function main() {
  if (process.platform !== 'win32') throw new Error('This runtime check requires Windows.');
  const directory = path.resolve(__dirname, '..', 'artifacts');
  await fs.mkdir(directory, { recursive: true });
  const marker = path.join(directory, `run smoke Ž ${process.pid}-${Date.now()}.txt`);
  const expected = 'Ogle Run — Unicode Ž and a path with spaces';
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const script = `[IO.File]::WriteAllText(${quote(marker)}, ${quote(expected)}, [Text.UTF8Encoding]::new($false))`;
  const executable = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  await createWindowsTools().runCommand(`"${executable}" -WindowStyle Hidden -NoProfile -NonInteractive -Command "${script}"`);
  const deadline = Date.now() + 10000;
  let contents;
  while (Date.now() < deadline) {
    try { contents = await fs.readFile(marker, 'utf8'); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(contents, expected, 'The hidden child must receive the command and Unicode path intact.');
  await fs.unlink(marker);
  console.log('Windows Run ShellExecute smoke passed: hidden child, quoted path, Unicode content.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
