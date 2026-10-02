'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// A single quiet native helper samples foreground state; no titles, input, or
// screen content are collected. stdin closes with Ogle, ending the helper.
function createFullscreenMonitor(onChange, { platform = process.platform, launch = spawn } = {}) {
  if (platform !== 'win32') { onChange(false); return { dispose() {} }; }
  let child, disposed = false, buffer = '', previous;
  const publish = value => { if (!disposed && value !== previous) { previous = value; onChange(value); } };
  try {
    const script = fs.readFileSync(path.join(__dirname, 'fullscreen-monitor.ps1'), 'utf8');
    child = launch(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, OGLE_OWNER_PID: String(process.pid) } });
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      if (buffer.length > 4096) { buffer = ''; return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (line === '0' || line === '1') publish(line === '1');
      }
    });
    child.stderr.on('data', () => {});
    // Failure must not start periodically raising over an unknown foreground.
    child.on('error', () => publish(null));
    child.on('exit', () => publish(null));
  } catch { publish(null); }
  return { dispose() { disposed = true; if (child) { child.stdin?.end(); child.kill(); child = null; } } };
}
module.exports = { createFullscreenMonitor };
