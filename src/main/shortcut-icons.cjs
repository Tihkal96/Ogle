'use strict';
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const executeFile=promisify(execFile);
// Ask Windows Shell to resolve the link's PIDL, including virtual destinations
// such as This PC. Such links have no normal filesystem target to inspect.
async function shellShortcutIcon(file,nativeImage){
  const script=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; Add-Type 'using System; using System.Runtime.InteropServices; public class OgleShellIcon { [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct Info { public IntPtr icon; public int index; public uint attributes; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string display; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=80)] public string type; } [DllImport("shell32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr SHGetFileInfo(string path,uint attributes,ref Info info,uint size,uint flags); [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon); }'; $info=New-Object OgleShellIcon+Info; [void][OgleShellIcon]::SHGetFileInfo($env:OGLE_SHORTCUT_FILE,0,[ref]$info,[Runtime.InteropServices.Marshal]::SizeOf($info),256); try { if($info.icon -eq [IntPtr]::Zero){exit 1}; $icon=[Drawing.Icon]::FromHandle($info.icon); $bitmap=$icon.ToBitmap(); $stream=New-Object IO.MemoryStream; $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($stream.ToArray()); $stream.Dispose(); $bitmap.Dispose() } finally { if($info.icon -ne [IntPtr]::Zero){[void][OgleShellIcon]::DestroyIcon($info.icon)} }`;
  const {stdout}=await executeFile(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:8000,maxBuffer:1024*1024,env:{...process.env,OGLE_SHORTCUT_FILE:file}});
  return nativeImage.createFromBuffer(Buffer.from(stdout.trim(),'base64'));
}
module.exports={shellShortcutIcon};
