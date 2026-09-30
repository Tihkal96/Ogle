'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { dialog, shell, app, net, nativeImage } = require('electron');
const crypto = require('node:crypto');
const { isUtf8 } = require('node:buffer');
const MAX_BYTES = 5 * 1024 * 1024;
function localPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) throw new Error('Choose an absolute local path');
  return path.resolve(value);
}
class DockFiles {
  constructor(window) { this.window = window; this.opened = new Map(); this.icons=new Map(); }
  async shortcutIcons(paths) {
    if(!Array.isArray(paths)||paths.length>200||paths.some(p=>typeof p!=='string'||p.length>8192))throw new Error('Invalid shortcut icon targets');
    const result=Object.create(null),queue=[...new Set(paths)];
    const worker=async()=>{while(queue.length){const target=queue.shift();
      try {
        if(this.icons.has(target)){result[target]=this.icons.get(target);continue;}
        let icon;
        if(/^https?:\/\//i.test(target)) {
          const url=new URL(target);if(url.username||url.password)continue;
          const response=await net.fetch(new URL('/favicon.ico',url.origin).href,{credentials:'omit',signal:AbortSignal.timeout(3500)});
          if(!response.ok)continue;
          const reader=response.body.getReader(),chunks=[];let size=0;
          for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>512*1024){await reader.cancel();throw new Error('Icon too large');}chunks.push(value);}
          icon=nativeImage.createFromBuffer(Buffer.concat(chunks));
        } else icon=await app.getFileIcon(localPath(target),{size:'large'});
        if(icon&&!icon.isEmpty()){const encoded=icon.resize({width:48,height:48,quality:'best'}).toDataURL();this.icons.set(target,encoded);result[target]=encoded;}
      } catch { /* A missing favicon or deleted target keeps its fallback icon. */ }
    }};
    await Promise.all(Array.from({length:Math.min(4,queue.length)},worker));return result;
  }
  async open() {
    const result = await dialog.showOpenDialog(this.window, { title: 'Open a text or code file', properties: ['openFile'] });
    if (result.canceled) return null;
    return this.read(result.filePaths[0]);
  }
  async read(file) {
    file = localPath(file);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Open a text file smaller than 5 MB');
    const data = await fs.readFile(file);
    if (data.includes(0)) throw new Error('This appears to be a binary or UTF-16 file. Open a UTF-8 text file.');
    if (!isUtf8(data)) throw new Error('This file is not valid UTF-8. Convert its encoding before opening it in Ogle.');
    this.opened.set(file, stat.mtimeMs);
    return { path: file, name: path.basename(file), text: data.toString('utf8'), mtime: stat.mtimeMs };
  }
  async save({ path: requested, text, saveAs } = {}) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new Error('The editor supports text files up to 5 MB');
    let target = requested ? localPath(requested) : null;
    if (!target || saveAs) {
      const result = await dialog.showSaveDialog(this.window, { title: 'Save text file', defaultPath: target || 'Untitled.txt' });
      if (result.canceled) return null;
      target = result.filePath;
    } else {
      let stat;
      try { stat = await fs.stat(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (stat && (!this.opened.has(target) || stat.mtimeMs !== this.opened.get(target))) {
        const answer = await dialog.showMessageBox(this.window, { type: 'question', message: 'This file may have changed outside the editor.', detail: 'Replace its current contents with your editor tab?', buttons: ['Cancel', 'Replace file'], defaultId: 0, cancelId: 0 });
        if (answer.response !== 1) return null;
      }
    }
    await fs.writeFile(target, text, 'utf8');
    const stat = await fs.stat(target);
    this.opened.set(target, stat.mtimeMs);
    return { path: target, name: path.basename(target), mtime: stat.mtimeMs };
  }
  async chooseShortcut(kind) {
    if (!kind) {
      const selected = await dialog.showMessageBox(this.window,{type:'question',message:'Choose a link target',buttons:['File or app','Folder','Cancel'],defaultId:0,cancelId:2});
      if(selected.response===2) return null;
      kind=selected.response===1?'folder':'file';
    }
    const result = await dialog.showOpenDialog(this.window, { title: 'Add links', properties: [kind === 'folder' ? 'openDirectory' : 'openFile','multiSelections'] });
    if (result.canceled) return null;
    return this.importShortcuts({paths:result.filePaths,urls:[]});
  }
  async openShortcut(target) {
    if (/^https?:\/\//i.test(target)) {
      const url = new URL(target);
      if (url.username || url.password) throw new Error('Links cannot contain embedded passwords');
      return shell.openExternal(url.href);
    }
    const error = await shell.openPath(localPath(target));
    if (error) throw new Error(error);
  }
  async importShortcuts({paths=[],urls=[]}={}) {
    if (!Array.isArray(paths) || !Array.isArray(urls) || paths.length+urls.length>100) throw new Error('Add up to 100 links at a time');
    const result=[];
    for(const value of paths) {
      const target=localPath(value),stat=await fs.stat(target);
      let icon='';try {icon=(await app.getFileIcon(target,{size:'large'})).toDataURL();} catch {}
      result.push({id:crypto.randomUUID(),path:target,name:path.basename(target),kind:stat.isDirectory()?'folder':'file',icon,parentId:null});
    }
    for(const value of urls) {
      const url=new URL(value);
      if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an HTTP or HTTPS website link');
      result.push({id:crypto.randomUUID(),path:url.href,name:url.hostname,kind:'url',parentId:null});
    }
    return result;
  }
  async readDirectory(target) {
    const folder = localPath(target);
    const entries = await fs.readdir(folder, { withFileTypes: true });
    return entries.filter(x => !x.isSymbolicLink()).slice(0, 1000).map(x => ({ name: x.name, path: path.join(folder, x.name), isDirectory: x.isDirectory() })).sort((a,b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  }
}
module.exports = { DockFiles, localPath };
