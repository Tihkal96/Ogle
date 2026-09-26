'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

function variable(env, name) {
  const key = Object.keys(env).find(key => key.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}
async function fileExists(file) {
  try { return (await fs.stat(file)).isFile(); } catch { return false; }
}
async function directories(root) {
  try { return (await fs.readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => path.join(root, entry.name)); }
  catch { return []; }
}
function queryInstalledStore(env) {
  const systemRoot = variable(env, 'SystemRoot') || 'C:\\Windows';
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise(resolve => {
    execFile(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Get-AppxPackage -Name OpenAI.Codex | Select-Object -ExpandProperty InstallLocation'],
      { env, windowsHide: true, timeout: 5000, maxBuffer: 65536, encoding: 'utf8' },
      (error, stdout) => resolve(error ? [] : stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)));
  });
}

// Deliberately uncached: installation or PATH changes are picked up on the next connection.
async function resolveCodexExecutable({ env = process.env, queryStore = queryInstalledStore } = {}) {
  const override = variable(env, 'PETDOCK_CODEX_PATH')?.trim();
  if (override) {
    const candidate = override.replace(/^"(.*)"$/, '$1');
    if (path.extname(candidate).toLowerCase() !== '.exe' || !await fileExists(candidate)) {
      throw new Error('PETDOCK_CODEX_PATH must point to an existing Codex .exe file. Correct or remove this override, then reconnect.');
    }
    return path.resolve(candidate);
  }
  const pathDirs = (variable(env, 'PATH') || '').split(';').map(value => value.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
  for (const directory of pathDirs) {
    const candidate = path.join(directory, 'codex.exe');
    if (await fileExists(candidate)) return path.resolve(candidate);
  }
  const local = variable(env, 'LOCALAPPDATA');
  if (local) {
    const versions = await directories(path.join(local, 'OpenAI', 'Codex', 'bin'));
    const candidates = await Promise.all(versions.map(async directory => {
      const file = path.join(directory, 'codex.exe');
      try { const stat = await fs.stat(file); return stat.isFile() ? { file, time: stat.mtimeMs } : null; } catch { return null; }
    }));
    candidates.sort((a, b) => (b?.time || 0) - (a?.time || 0));
    const latest = candidates.find(Boolean);
    if (latest) return latest.file;
  }
  let storeRoots = [];
  try { storeRoots = await queryStore(env); } catch { /* Store discovery is optional. */ }
  for (const root of Array.isArray(storeRoots) ? storeRoots : []) {
    const candidate = path.join(root, 'app', 'resources', 'codex.exe');
    if (await fileExists(candidate)) return candidate;
  }
  // npm's wrapper is JS/cmd; locate its native Windows executable without executing it.
  const roaming = variable(env, 'APPDATA');
  const prefixes = new Set([...pathDirs, ...(roaming ? [path.join(roaming, 'npm')] : [])]);
  for (const prefix of prefixes) {
    const scope = path.join(prefix, 'node_modules', '@openai');
    const packages = (await directories(scope)).filter(directory => /^codex(?:-win32-(?:x64|arm64))?$/.test(path.basename(directory)));
    for (const packageRoot of packages) {
      for (const arch of [process.arch === 'arm64' ? 'aarch64' : 'x86_64']) {
        const candidate = path.join(packageRoot, 'vendor', `${arch}-pc-windows-msvc`, 'codex', 'codex.exe');
        if (await fileExists(candidate)) return candidate;
      }
    }
  }
  const error = new Error('Codex could not be found on this PC. Install and open the Codex Windows app, then reconnect in Ogle. If Codex is installed elsewhere, set PETDOCK_CODEX_PATH to its codex.exe file and restart Ogle.');
  error.code = 'CODEX_NOT_INSTALLED';
  throw error;
}

module.exports = { resolveCodexExecutable };
