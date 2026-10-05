"use strict";
// Two-phase handoff: ready does not apply anything; commit is explicit and cancellable.
// The caller must block new input, check active work, and flush saves before commit.
// Explorer launches the hidden helper independently of the original application console.
const fs = require("node:fs/promises"), path = require("node:path"), crypto = require("node:crypto"), { spawn, execFile } = require("node:child_process");
const { createReadStream } = require("node:fs");
async function fileHash(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function assertInstallDirectory(directory, { allowMissing = false } = {}) {
  const target = path.resolve(directory), root = path.parse(target).root;
  const forbidden = [root, process.env.USERPROFILE, process.env.APPDATA, process.env.LOCALAPPDATA, process.env.SystemRoot, process.env.ProgramFiles, process.env["ProgramFiles(x86)"], ...["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos", "OneDrive"].map((name) => process.env.USERPROFILE && path.join(process.env.USERPROFILE, name))].filter(Boolean).map((p) => path.resolve(p).toLowerCase());
  if (["desktop", "documents", "downloads", "pictures", "music", "videos", "onedrive", "windows", "system32", "program files", "program files (x86)", "users", "appdata"].includes(path.basename(target).toLowerCase()) || forbidden.includes(target.toLowerCase()) || target.toLowerCase().startsWith(path.resolve(process.env.SystemRoot || "C:\\Windows").toLowerCase() + path.sep)) throw Error("This application location cannot be updated automatically.");
  let current = target;
  while (current !== path.parse(current).root) {
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw Error("Automatic updates cannot replace an application through a junction or symbolic link.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    current = path.dirname(current);
  }
  if (allowMissing && !await fs.stat(target).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  })) return target;
  await fs.access(path.join(target, "Ogle.exe"));
  await fs.access(path.join(target, "resources", "app.asar"));
  return target;
}
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
async function prepareHandoff({ currentExe, stagedFolder, dataDir, pid = process.pid, launch = true, launcher = spawn, targetDirectory = null, allowNewTarget = false, shortcuts = [], version = null }) {
  if (path.basename(currentExe).toLowerCase() !== "ogle.exe") throw Error("Automatic replacement is available only in the packaged Ogle application.");
  if (!Number.isSafeInteger(pid) || pid <= 0) throw Error("Invalid application process.");
  const origin = await assertInstallDirectory(path.dirname(currentExe));
  const target = await assertInstallDirectory(targetDirectory || origin, { allowMissing: allowNewTarget }), source = await assertInstallDirectory(stagedFolder);
  const hadOriginal = await fs.stat(target).then(() => true, (error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  if (!Array.isArray(shortcuts) || shortcuts.length > 3 || shortcuts.some((item) => !item || typeof item.path !== "string" || !path.isAbsolute(item.path) || path.extname(item.path).toLowerCase() !== ".lnk")) throw Error("Invalid install shortcut plan.");
  const profile = path.resolve(dataDir);
  if (profile.toLowerCase() === target.toLowerCase() || profile.toLowerCase().startsWith(target.toLowerCase() + path.sep)) throw Error("The local profile is inside the application folder; use a manual update that preserves it.");
  if (target === source || source.startsWith(target + path.sep) || target.startsWith(source + path.sep)) throw Error("The staged update must be separate from the running application.");
  const parent = path.dirname(target);
  await fs.mkdir(parent, { recursive: true });
  const id = crypto.randomUUID(), candidate = path.join(parent, ".ogle-update-" + id), backup = path.join(parent, ".ogle-backup-" + id);
  if (path.dirname(candidate) !== parent || path.dirname(backup) !== parent) throw Error("Invalid update destination.");
  await fs.cp(source, candidate, { recursive: true, errorOnExist: true, force: false });
  await assertInstallDirectory(candidate);
  try {
    const markerPath = path.join(target, ".ogle-user-install.json"), stat = await fs.lstat(markerPath);
    if (!stat.isSymbolicLink() && stat.size < 4096) {
      const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
      if (marker.schema === 1 && marker.application === "Ogle") {
        const next = { schema: 1, application: "Ogle", version: version || marker.version, exeHash: await fileHash(path.join(candidate, "Ogle.exe")), asarHash: await fileHash(path.join(candidate, "resources", "app.asar")) };
        const temporary = path.join(candidate, ".ogle-marker-" + id + ".tmp");
        await fs.writeFile(temporary, JSON.stringify(next));
        await fs.rename(temporary, path.join(candidate, ".ogle-user-install.json"));
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const helperDirectory = path.join(path.resolve(dataDir), "updates");
  await fs.mkdir(helperDirectory, { recursive: true });
  const script = path.join(helperDirectory, "handoff-" + id + ".ps1"), ready = script + ".ready", log = script + ".log", commit = script + ".commit", cancel = script + ".cancel";
  const body = `$ErrorActionPreference='Stop'
$target=${quote(target)}
$candidate=${quote(candidate)}
$backup=${quote(backup)}
$exe=Join-Path $target 'Ogle.exe'
${['PETDOCK_DATA_DIR','CODEX_HOME','CLAUDE_CONFIG_DIR'].map(key=>'$env:'+key+'='+(process.env[key]?quote(path.resolve(process.env[key])):'$null')).join('\n')}
$hadOriginal=${hadOriginal ? "$true" : "$false"}
$old=Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if(-not $old){throw 'The original application process is missing.'}
$started=$old.StartTime.Ticks
Set-Content -LiteralPath ${quote(ready)} -Value 'ready'
try {
 $deadline=(Get-Date).AddMinutes(2)
 while(-not(Test-Path -LiteralPath ${quote(commit)})){if((Test-Path -LiteralPath ${quote(cancel)}) -or (Get-Date) -ge $deadline){throw 'Update handoff was cancelled before applying.'};Start-Sleep -Milliseconds 100}
 if(Test-Path -LiteralPath ${quote(cancel)}){throw 'Update handoff was cancelled.'}
 while((Get-Date) -lt $deadline){if(Test-Path -LiteralPath ${quote(cancel)}){throw 'Update handoff was cancelled.'};$running=Get-Process -Id ${pid} -ErrorAction SilentlyContinue;if(-not $running -or $running.StartTime.Ticks -ne $started){break};Start-Sleep -Milliseconds 200}
 if($running -and $running.StartTime.Ticks -eq $started){throw 'Ogle stayed open; the update was not applied.'}
 if(Test-Path -LiteralPath ${quote(cancel)}){throw 'Update handoff was cancelled.'}
 if((Test-Path -LiteralPath $target) -ne $hadOriginal){throw 'Installation destination changed before applying.'}
 foreach($dir in @($target,$candidate)|Where-Object {Test-Path -LiteralPath $_}){if((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Application location changed.'}}
 if($hadOriginal){Move-Item -LiteralPath $target -Destination $backup}
 try {Move-Item -LiteralPath $candidate -Destination $target} catch {if($hadOriginal){Move-Item -LiteralPath $backup -Destination $target};throw}
 try {$new=Start-Process -FilePath $exe -WorkingDirectory $target -WindowStyle Hidden -PassThru;Start-Sleep -Seconds 3;if($new.HasExited){throw 'Updated application exited before startup.'}} catch {Move-Item -LiteralPath $target -Destination $candidate;if($hadOriginal){Move-Item -LiteralPath $backup -Destination $target;Start-Process -FilePath $exe -WorkingDirectory $target -WindowStyle Hidden};throw}
 ${shortcuts.map((item) => "$shortcutPath=" + quote(item.path) + ";[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($shortcutPath))|Out-Null;$link=(New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath);$link.TargetPath=$exe;$link.WorkingDirectory=$target;$link.Save()").join("\n")}
 @{state='updated';pid=$new.Id;exePath=$exe;backup=$backup} | ConvertTo-Json -Compress | Set-Content -Encoding UTF8 -LiteralPath ${quote(log)}
} catch {@{state='failed';message=($_ | Out-String);backup=$backup} | ConvertTo-Json -Compress | Set-Content -Encoding UTF8 -LiteralPath ${quote(log)}}
`;
  await fs.writeFile(script, body, "utf8");
  if (!launch) return { script, candidate, backup, target, ready, log, commit, cancel };
  await new Promise((resolve, reject) => {
    const parser = "$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile(" + quote(script) + ",[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){exit 1}";
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(parser, "utf16le").toString("base64")], { windowsHide: true, timeout: 1e4 }, (error) => error ? reject(Error("The update helper could not be validated. Ogle stayed open.")) : resolve());
  });
  const helperArguments = "-NoLogo -NoProfile -NonInteractive -EncodedCommand " + Buffer.from(body, "utf16le").toString("base64");
  const bootstrap = "(New-Object -ComObject Shell.Application).ShellExecute(" + quote(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")) + "," + quote(helperArguments) + "," + quote(helperDirectory) + ",'open',0)";
  const child = launcher("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(bootstrap, "utf16le").toString("base64")], { windowsHide: true, detached: false, stdio: "ignore" });
  let launchError;
  child.once("error", (error) => {
    launchError = error;
  });
  child.unref();
  for (let i = 0; i < 150; i++) {
    if (launchError) throw Error("Windows could not start the update helper. Ogle stayed open.");
    try {
      await fs.access(ready);
      return { script, candidate, backup, target, ready, log, commit, cancel };
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("The update helper did not become ready. Ogle stayed open.");
}
async function commitHandoff(handoff) {
  await fs.writeFile(handoff.commit, "commit", "utf8");
}
async function cancelHandoff(handoff) {
  await fs.writeFile(handoff.cancel, "cancel", "utf8");
}
module.exports = { prepareHandoff, assertInstallDirectory, commitHandoff, cancelHandoff };
