'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const TOOL_DEFINITIONS = [
  ['registry', 'Registry Editor', 'regedit.exe'],
  ['components', 'Component Services / DCOM', 'comexp.msc'],
  ['control-panel', 'Control Panel', 'control.exe'],
  ['iis', 'IIS Manager', 'inetsrv/InetMgr.exe'],
  ['remote-desktop', 'Remote Desktop (mstsc)', 'mstsc.exe'],
  ['computer-management', 'Computer Management', 'compmgmt.msc'],
  ['services', 'Services', 'services.msc'],
  ['event-viewer', 'Event Viewer', 'eventvwr.msc'],
  ['device-manager', 'Device Manager', 'devmgmt.msc'],
  ['disk-management', 'Disk Management', 'diskmgmt.msc'],
  ['task-manager', 'Task Manager', 'Taskmgr.exe'],
  ['task-scheduler', 'Task Scheduler', 'taskschd.msc'],
  ['firewall', 'Windows Firewall with Advanced Security', 'WF.msc'],
  ['certificates-user', 'Certificates — Current User', 'certmgr.msc'],
  ['certificates-machine', 'Certificates — Local Computer', 'certlm.msc'],
  ['group-policy', 'Local Group Policy Editor', 'gpedit.msc'],
  ['local-security', 'Local Security Policy', 'secpol.msc'],
  ['system-information', 'System Information', 'msinfo32.exe'],
  ['resource-monitor', 'Resource Monitor', 'resmon.exe'],
  ['performance-monitor', 'Performance Monitor', 'perfmon.msc'],
  ['network-connections', 'Network Connections', 'ncpa.cpl'],
  ['programs', 'Programs and Features', 'appwiz.cpl'],
  ['system-properties', 'System Properties', 'sysdm.cpl']
];

function expandEnvironment(value, env) {
  const variables = new Map(Object.entries(env).map(([key, val]) => [key.toLowerCase(), val]));
  return value.replace(/%([^%]+)%/g, (match, key) => variables.get(key.toLowerCase()) ?? match);
}

async function parseRunCommand(command, { env = process.env, exists = async file => {
  try { await fs.access(file); return true; } catch { return false; }
} } = {}) {
  if (typeof command !== 'string' || !command.trim()) throw new Error('Enter a command, application, folder or address.');
  if (command.length > 8192 || /[\r\n\0]/.test(command)) throw new Error('Use a single command of up to 8192 characters.');
  const value = expandEnvironment(command.trim(), env);
  // A complete path takes priority over splitting at spaces, just like pasting a folder in Run.
  if (await exists(value)) return { target: value, args: '' };
  if (value.startsWith('"')) {
    const end = value.indexOf('"', 1);
    if (end < 2) throw new Error('Close the quotation marks around the application path.');
    if (value[end + 1] && !/\s/.test(value[end + 1])) throw new Error('Separate the application path and arguments with a space.');
    return { target: value.slice(1, end), args: value.slice(end + 1).trimStart() };
  }
  // URLs and Windows URI schemes are whole targets; their punctuation is never shell code.
  if (/^[a-z][a-z0-9+.-]+:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return { target: value, args: '' };
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(value);
  return { target: match[1], args: match[2] || '' };
}

function createWindowsTools({ env = process.env, platform = process.platform,
  execute = promisify(execFile), exists = async file => {
    try { await fs.access(file); return true; } catch { return false; }
  } } = {}) {
  const windows = env.SystemRoot || env.WINDIR || 'C:\\Windows';
  const system = path.win32.join(windows, 'System32');
  const tools = TOOL_DEFINITIONS.map(([id, label, filename]) => ({ id, label,
    target: path.win32.join(filename === 'regedit.exe' ? windows : system, filename) }));

  async function launch({ target, args }) {
    if (platform !== 'win32') throw new Error('Windows tools are available on Windows only.');
    // Input travels as data, never interpolated into executable PowerShell syntax.
    const payload = Buffer.from(JSON.stringify({ target, args }), 'utf8').toString('base64');
    const script = `$ErrorActionPreference = 'Stop'\ntry {\n` +
      `$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json\n` +
      `$shell = New-Object -ComObject Shell.Application\n` +
      `$shell.ShellExecute([string]$request.target, [string]$request.args, '', 'open', 1)\n` +
      `} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
    try {
      await execute(path.win32.join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
        { windowsHide: true, timeout: 15000, maxBuffer: 32768 });
    } catch (error) {
      const detail = String(error.stderr || '').trim().slice(0, 700);
      throw new Error(detail || 'Windows could not open this command. Check its name or path.');
    }
    return { launched: true };
  }

  return {
    async listTools() {
      return Promise.all(tools.map(async tool => ({ id: tool.id, label: tool.label,
        available: platform === 'win32' && await exists(tool.target) })));
    },
    async runCommand(command) { return launch(await parseRunCommand(command, { env, exists })); },
    async runTool(id) {
      const tool = tools.find(entry => entry.id === id);
      if (!tool) throw new Error('Choose a Windows tool from the list.');
      if (!await exists(tool.target)) throw new Error(`${tool.label} is not installed on this Windows edition.`);
      return launch({ target: tool.target, args: '' });
    }
  };
}

module.exports = { createWindowsTools, parseRunCommand };
