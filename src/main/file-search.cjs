'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const LIMIT = 100;
const SCOPE = 'Desktop, Documents, Downloads, Pictures, Music and Videos';
const DRIVE_SCOPE = 'Local drives and personal folders (file names and paths)';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function parseResults(output) {
  const results = [], seen = new Set();
  for (const line of String(output).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(line) || /[\x00-\x1f]/.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); results.push(line);
    if (results.length === LIMIT) break;
  }
  return results;
}
// Everything INI lists quote paths and escape backslashes (plain Windows paths
// silently lose separators). Do not enable raw-volume indexing or elevation.
function configuration(roots) {
  const quoted = roots.map(root => '"' + root.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',');
  return ['[Everything]', 'app_data=0', 'run_as_admin=0', 'run_in_background=1',
    'show_tray_icon=0', 'check_for_updates_on_startup=0',
    'auto_include_fixed_volumes=0', 'auto_include_removable_volumes=0',
    'auto_include_fixed_refs_volumes=0', 'auto_include_removable_refs_volumes=0',
    'folder_update_thread_mode_background=1', 'monitor_thread_mode_background=1',
    'max_threads=1', 'index_size=0', 'index_date_modified=0',
    'index_date_created=0', 'index_date_accessed=0', 'index_attributes=0',
    'folders=' + quoted, 'folder_monitor_changes=' + roots.map(() => '1').join(','),
    'folder_update_types=' + roots.map(() => '0').join(','), ''].join('\r\n');
}
function createFileSearch({
  dataDir = () => path.join(process.env.APPDATA || require('node:os').homedir(), 'PetDock'),
  roots = () => ['Desktop','Documents','Downloads','Pictures','Music','Videos'].map(name => path.join(require('node:os').homedir(),name)),
  binaryDir = __dirname.includes('app.asar') ? path.join(process.resourcesPath, 'everything') : path.resolve(__dirname, '../../vendor/everything'),
  io = fs, launch = spawn, run = execFile, includeFixedDrives = false, discoverDrives
} = {}) {
  let child = null, starting = null, busy = false, stopped = false, instance = '';
  const scope = includeFixedDrives ? DRIVE_SCOPE : SCOPE;
  const execute = (file,args,timeout=5000) => new Promise((resolve,reject) => {
    run(file,args,{shell:false,windowsHide:true,encoding:'utf8',timeout,maxBuffer:1024*1024},(error,stdout)=>error?reject(error):resolve(stdout));
  });
  async function ensureStarted() {
    if (child) return;
    if (starting) return starting;
    starting = (async () => {
      const directory = path.join(typeof dataDir === 'function' ? dataDir() : dataDir, 'file-search');
      instance = 'Ogle-' + crypto.createHash('sha256').update(directory.toLowerCase()).digest('hex').slice(0,16);
      const available = [];
      const personal = await (typeof roots === 'function' ? roots() : roots);
      let drives = [];
      if (includeFixedDrives) {
        // Enumerate volumes only; Everything owns the background index.
        drives = discoverDrives ? await discoverDrives() : JSON.parse(await execute(
          path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
          ['-NoLogo','-NoProfile','-NonInteractive','-Command',
            "ConvertTo-Json -Compress -InputObject @([System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady } | ForEach-Object { $_.RootDirectory.FullName })"],10000));
      }
      const candidates = [...drives, ...personal];
      // Do not index a nested folder twice when its fixed drive is present.
      const unique = candidates.filter((root,index) => !candidates.some((parent,other) =>
        other !== index && root.toLowerCase().startsWith(parent.replace(/[\\/]?$/,path.sep).toLowerCase()) &&
        (root.length > parent.length || other < index)));
      for (const root of unique) {
        if (!path.isAbsolute(root) || /[\r\n]/.test(root)) continue;
        try { if ((await io.stat(root)).isDirectory()) available.push(root); } catch {}
      }
      if (!available.length) throw new Error('No personal folders are available to search.');
      await io.mkdir(directory,{recursive:true});
      const config = path.join(directory,'Everything.ini');
      await io.writeFile(config, configuration([...new Set(available)]),'utf8');
      if (stopped) throw new Error('Search is closing.');
      const spawned = launch(path.join(binaryDir,'Everything.exe'),['-instance',instance,'-config',config,'-db',path.join(directory,'Everything.db'),'-startup'],{windowsHide:true,stdio:'ignore'});
      child = spawned;
      spawned.once('exit',()=>{if(child===spawned)child=null;});
      await new Promise((resolve,reject)=>{spawned.once('spawn',resolve);spawned.once('error',error=>{if(child===spawned)child=null;reject(error);});});
      spawned.unref?.();
    })();
    try { await starting; } finally { starting=null; }
  }
  return {
    async search(query, options = {}) {
      if(!options || typeof options!=='object' || Array.isArray(options) || (Object.hasOwn(options,'includeFolders') && typeof options.includeFolders!=='boolean'))throw new Error('Invalid search options');
      if (typeof query !== 'string' || !query.trim() || query.length>1024 || /[\x00-\x1f]/.test(query)) throw new Error('Enter a file search of 1–1024 characters.');
      if (busy) return {status:'busy',results:[],limit:LIMIT,scope,message:'Preparing search…'};
      busy=true;
      try {
        await ensureStarted();
        const args=['-instance',instance,'-p','-n',String(LIMIT),'-timeout','3000','-txt','-no-header','-no-footer','-no-highlight','-no-double-quote','-no-pause','-cp','65001',...(options.includeFolders===true?[]:['/a-d']),'--',query.trim()];
        let output;
        // ES 1.1.0.38 checks EVERYTHING_IPC_IS_DB_LOADED with -timeout on
        // Everything >=1.4. Expiry exits with code 8, never success-empty.
        // The IPC window can also take a moment to appear after creation.
        for(let attempt=0;attempt<3;attempt++) {
          try { output=await execute(path.join(binaryDir,'es.exe'),args);break; }
          catch(error) {if(error.code!==8||attempt===2)throw error;await delay(100);}
        }
        return {status:'ok',results:parseResults(output),limit:LIMIT,scope};
      } catch(error) {
        return {status:error.code===8||error.killed?'initializing':'unavailable',results:[],limit:LIMIT,scope,
          message:error.code===8||error.killed?'Preparing the file index. Results will appear automatically when ready.':'File search is temporarily unavailable. Try again in a moment.'};
      } finally {busy=false;}
    },
    async dispose() {
      stopped=true;
      // Start the exit command synchronously during Electron's before-quit;
      // yielding on a null startup promise can let the app exit first.
      if(starting)try {await starting;}catch{}
      if(!instance)return;
      try {await execute(path.join(binaryDir,'Everything.exe'),['-instance',instance,'-exit'],3000);}catch{child?.kill();}
      child=null;
    }
  };
}
module.exports={createFileSearch,parseResults,configuration};
