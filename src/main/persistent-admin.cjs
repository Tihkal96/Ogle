'use strict';
// The scheduled task runs only an administrator-owned copy of the helper.
// Never schedule the portable Ogle executable, scripts, or a user-writable config.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const zlib = require('node:zlib');
const SID = /^S-1-5-21-\d+-\d+-\d+-\d+$/;
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
function run(file, args, timeout = 120000) {
  return new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024 }, (error, stdout) => error ? reject(new Error('Administrator helper setup was cancelled or failed. ' + (error.stderr || error.message))) : resolve(stdout.trim())));
}
function elevationWrapper(script) {
  // In-memory compression keeps even long portable paths below Windows' command
  // line limit without executing a replaceable temporary script as administrator.
  const data = zlib.gzipSync(Buffer.from(script, 'utf8')).toString('base64');
  const loader = `$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$m=New-Object IO.MemoryStream(,[Convert]::FromBase64String('${data}'));$g=New-Object IO.Compression.GzipStream($m,[IO.Compression.CompressionMode]::Decompress);$r=New-Object IO.StreamReader($g);$s=$r.ReadToEnd();$r.Dispose();& ([ScriptBlock]::Create($s))`;
  const encoded = Buffer.from(loader, 'utf16le').toString('base64');
  return `$ErrorActionPreference='Stop'; try { $p=Start-Process -FilePath "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile -NonInteractive -EncodedCommand ${encoded}'; exit $p.ExitCode } catch { exit 1 }`;
}
function powershell(script, elevated = false) {
  const outer = elevated ? elevationWrapper(script) : script;
  return run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(outer, 'utf16le').toString('base64')]);
}
function installerScript({ sid, source, executable, remove = false }) {
  if (!SID.test(sid) || path.basename(executable) !== executable || !/^[\w .-]+\.exe$/i.test(executable)) throw new Error('Invalid administrator helper installation identity.');
  return `$ErrorActionPreference='Stop'
$sid=${quote(sid)}
if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $sid) { throw 'Enable this feature from an administrator Windows account.' }
$base=Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'OgleAdmin'
$target=Join-Path $base $sid
$task='OgleAdmin-'+$sid
foreach($p in @($base,$target)) { if ((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe helper installation path.' } }
${remove ? `
Disable-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue | Out-Null
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq (Join-Path $target ${quote(executable)}) } | ForEach-Object {
  $process=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  if ($process) { Stop-Process -InputObject $process -Force; if (-not $process.WaitForExit(10000)) { throw 'Administrator helper is still closing. Try removing access again.' }; $process.Dispose() }
}
if (Test-Path -LiteralPath $target) {
  $resolved=(Get-Item -LiteralPath $target).FullName
  if ($resolved -ne $target) { throw 'Unsafe helper removal path.' }
  for($attempt=0;$attempt -lt 12;$attempt++) {
    try { Get-ChildItem -LiteralPath $resolved -Force | Where-Object { $_.Name -ne 'admin-helper.json' } | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }; break }
    catch { if($attempt -eq 11) { throw }; Start-Sleep -Milliseconds 250 }
  }
  # Retain configuration until locked binaries are gone, keeping Remove available
  # in Ogle if cleanup needs to be retried.
  Remove-Item -LiteralPath (Join-Path $resolved 'admin-helper.json') -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $resolved -Force
}
# Keep the disabled task registered until files are gone so cleanup is retryable.
Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
` : `
$source=${quote(source)}
if (Test-Path -LiteralPath $target) { throw 'A helper installation already exists. Remove it before reinstalling.' }
if ((Get-Item -LiteralPath $source -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Portable directory cannot be a link.' }
if (Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1) { throw 'Portable directory contains links.' }
New-Item -ItemType Directory -Path $base -Force | Out-Null
# Replace inheritance before copying any executable content into this directory.
$baseAcl=New-Object Security.AccessControl.DirectorySecurity
$baseAcl.SetAccessRuleProtection($true,$false)
$baseAcl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
foreach($id in @('S-1-5-18','S-1-5-32-544')) { $baseAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($id)),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))) }
$baseAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')))
Set-Acl -LiteralPath $base -AclObject $baseAcl
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
$acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
foreach($id in @('S-1-5-18','S-1-5-32-544')) { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($id)),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))) }
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')))
# Base allows traversal; each per-user child has its own protected ACL.
New-Item -ItemType Directory -Path $target | Out-Null
Set-Acl -LiteralPath $target -AclObject $acl
try {
  Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force
  $bytes=New-Object byte[] 32; $rng=[Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose()
  $token=([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
  @{version=1;sid=$sid;token=$token;pipe=('\\\\.\\pipe\\ogle-admin-'+$sid)} | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $target 'admin-helper.json') -Encoding UTF8
  $action=New-ScheduledTaskAction -Execute (Join-Path $target ${quote(executable)}) -Argument '--persistent-terminal-worker' -WorkingDirectory $target
  $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Highest
  $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $task -Action $action -Principal $principal -Settings $settings -Force | Out-Null
  $service=New-Object -ComObject 'Schedule.Service'; $service.Connect()
  $service.GetFolder('\\').GetTask($task).SetSecurityDescriptor(('D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGX;;;'+$sid+')'),0)
} catch {
  Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  throw
}
`}
`;
}
function validateConfig(config, sid) {
  if (!config || config.version !== 1 || !SID.test(sid) || config.sid !== sid || !/^[a-f0-9]{64}$/.test(config.token || '') || config.pipe !== `\\\\.\\pipe\\ogle-admin-${sid}`) throw new Error('Invalid installed administrator helper. Remove and enable it again in Settings.');
  return config;
}
class PersistentAdmin {
  constructor({ executable = process.execPath, packaged = false, execute = powershell } = {}) { Object.assign(this, { executable, packaged, execute }); }
  async identity() {
    if (!this.sid) {
      const sid = await this.execute('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
      if (!SID.test(sid)) throw new Error('Persistent administrator access requires a local or domain Windows user account.');
      this.sid = sid;
    }
    return this.sid;
  }
  async location() { return path.join(process.env.ProgramFiles || 'C:\\Program Files', 'OgleAdmin', await this.identity()); }
  async config() {
    try { return validateConfig(JSON.parse(fs.readFileSync(path.join(await this.location(), 'admin-helper.json'), 'utf8').replace(/^\uFEFF/, '')), await this.identity()); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  // This reports installed configuration. If the task is externally removed or
  // disabled, keep Remove available; start reports the repair action explicitly.
  async canPersist() {
    if (!this.packaged) return false;
    const result = String(await this.execute("[bool]([Security.Principal.WindowsIdentity]::GetCurrent().Groups.Value -contains 'S-1-5-32-544')")).trim().toLowerCase();
    if (!['true', 'false'].includes(result)) throw new Error('Could not check Windows administrator account membership.');
    return result === 'true';
  }
  async status() {
    if (!this.packaged) return { available: false, enabled: false };
    const available = await this.canPersist(), enabled = !!(await this.config());
    return available ? { available, enabled } : { available, enabled, reason: 'standard-account' };
  }
  async enable() {
    if (!this.packaged) throw new Error('Persistent administrator access is available in the packaged Ogle app.');
    if (await this.config()) return this.status();
    if (!this.installing) this.installing = (async () => {
      if (!await this.canPersist()) throw new Error('Persistent administrator access requires an administrator Windows account. Admin shells can still request Windows approval for this Ogle session.');
      return this.execute(installerScript({ sid: await this.identity(), source: path.dirname(this.executable), executable: path.basename(this.executable) }), true);
    })().finally(() => { this.installing = null; });
    await this.installing; return this.status();
  }
  async disable() { if (!this.packaged) return this.status(); await this.execute(installerScript({ sid: await this.identity(), source: '', executable: path.basename(this.executable), remove: true }), true); return this.status(); }
  async start() {
    await this.enable(); const config = await this.config();
    try { await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/schtasks.exe'), ['/Run', '/TN', 'OgleAdmin-' + config.sid]); }
    catch { throw new Error('The installed administrator helper could not start. Remove administrator access in Settings, then enable it again.'); }
    return config;
  }
}
module.exports = { PersistentAdmin, installerScript, validateConfig, elevationWrapper };
