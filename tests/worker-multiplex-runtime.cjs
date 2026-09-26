'use strict';
// Explicit packaged-runtime check. No UAC or administrator launch is performed.
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

async function run() {
  if (process.platform !== 'win32') throw new Error('This runtime test requires Windows ConPTY.');
  const executable = process.argv[2] || path.resolve(__dirname, '../dist/Ogle-win32-x64/Ogle.exe');
  // Optional app root runs the same entry point under development Electron.
  const workerArgs = process.argv[3] ? [path.resolve(process.argv[3])] : [];
  assert.ok(fs.existsSync(executable), `Packaged executable missing: ${executable}`);
  const pipe = `\\\\.\\pipe\\petdock-${crypto.randomUUID()}`, token = crypto.randomBytes(32).toString('hex');
  const output = new Map(), ready = new Set(), exited = new Set(), waiters = new Set();
  let client, worker, authenticated = false, fatal = null;
  const wake = () => { for (const waiter of [...waiters]) waiter(); };
  function waitFor(predicate, description, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(check); reject(new Error(`Timed out: ${description}`)); }, timeout);
      function check() {
        if (fatal || predicate()) { clearTimeout(timer); waiters.delete(check); fatal ? reject(fatal) : resolve(); }
      }
      waiters.add(check); check();
    });
  }
  const send = message => client.write(JSON.stringify(message) + '\n');
  const server = net.createServer(socket => {
    assert.equal(client, undefined, 'Worker must use one connection'); client = socket;
    let buffer = ''; socket.setEncoding('utf8');
    socket.on('error', error => { fatal = error; wake(); });
    socket.on('data', chunk => {
      buffer += chunk; let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        if (!authenticated) {
          if (message.token !== token) fatal = new Error('Worker authentication token mismatch');
          else authenticated = true;
        } else if (message.event === 'error') fatal = new Error(`Worker ${message.id}: ${message.data}`);
        else if (message.event === 'ready') ready.add(message.id);
        else if (message.event === 'exit') exited.add(message.id);
        else if (message.event === 'data') output.set(message.id, (output.get(message.id) || '') + message.data);
      }
      wake();
    });
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve); });
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    worker = spawn(executable, [...workerArgs, '--terminal-worker', pipe, token], { windowsHide: true, stdio: 'ignore', env });
    worker.on('error', error => { fatal = error; wake(); });
    let workerExit;
    worker.on('exit', (code, signal) => { workerExit = { code, signal }; wake(); });
    await waitFor(() => authenticated, 'worker authentication');
    const pid = worker.pid;
    send({ event: 'start', id: 'cmd-first', config: { shell: 'cmd', cwd: path.dirname(executable), cols: 100, rows: 24 } });
    send({ event: 'start', id: 'ps-first', config: { shell: 'powershell', cwd: path.dirname(executable), cols: 100, rows: 24 } });
    await waitFor(() => ready.has('cmd-first') && ready.has('ps-first'), 'both shells ready');
    send({ event: 'write', id: 'cmd-first', data: 'set /a petdockResult=6*7\recho CMD_ONE_%petdockResult%\r' });
    send({ event: 'write', id: 'ps-first', data: "Write-Output ('PS_ONE_' + (7*7))\r" });
    await waitFor(() => output.get('cmd-first')?.includes('CMD_ONE_42') && output.get('ps-first')?.includes('PS_ONE_49'), 'independent computed shell results');
    assert.equal(output.get('cmd-first').includes('PS_ONE_49'), false, 'PowerShell output leaked into CMD');
    assert.equal(output.get('ps-first').includes('CMD_ONE_42'), false, 'CMD output leaked into PowerShell');
    send({ event: 'close', id: 'cmd-first' }); send({ event: 'close', id: 'ps-first' });
    await waitFor(() => exited.has('cmd-first') && exited.has('ps-first'), 'first two shells close');
    assert.equal(workerExit, undefined, 'Helper exited when all shells closed');
    send({ event: 'start', id: 'cmd-reused', config: { shell: 'cmd', cwd: path.dirname(executable), cols: 80, rows: 20 } });
    await waitFor(() => ready.has('cmd-reused'), 'third shell ready on existing helper');
    send({ event: 'write', id: 'cmd-reused', data: 'set /a petdockResult=9*9\recho CMD_REUSED_%petdockResult%\r' });
    await waitFor(() => output.get('cmd-reused')?.includes('CMD_REUSED_81'), 'third shell computed result');
    assert.equal(worker.pid, pid, 'Helper process unexpectedly changed');
    client.end();
    await waitFor(() => workerExit !== undefined, 'helper exits after parent disconnect', 10000);
    assert.equal(workerExit.code, 0);
    console.log(JSON.stringify({ passed: true, executable, workerPid: pid, shells: ['CMD_ONE_42', 'PS_ONE_49', 'CMD_REUSED_81'], reusedSingleHelper: true, disconnectedExitCode: workerExit.code, elevated: false }));
  } finally {
    client?.destroy(); server.close();
    if (worker && worker.exitCode === null) worker.kill();
  }
}
run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
