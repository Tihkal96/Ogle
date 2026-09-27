'use strict';
const fs = require('node:fs');
const path = require('node:path');
const defaults = () => ({ pinnedThreads: [], drafts: {}, note: '', petId: 'rinne-mini', petClickAction:'codex', shortcutVisibility:'Control+Alt+O', shortcutPanel:'Control+Alt+Space', shortcutBar:'Control+Alt+B', statsClicks:true, statsKeys:true, statsCpu:true, statsRam:true, statsPosition:'right', alwaysOnTop: true, lastThreadId: null, projectPath: '', editorTabs: [], activeEditorTab: '', shortcuts: [], shortcutsView: 'icons', toolbarOrder: [], terminalCommands: [], autoExpand: true, autoStart: true, hoverDelay: 3000, autoCollapseDelay: 10000, petScale: 1, showTime: true, showDate: false, timeFormat: '24h', dateFormat: 'locale', theme: 'dark', sidebarVisible: true });
function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings');
  const clean = {};
  for(const key of ['shortcutVisibility','shortcutPanel','shortcutBar']) if(Object.hasOwn(patch,key)) {
    const value=patch[key];
    if(typeof value!=='string' || value.length>80 || (value && !/^(?:(?:Control|Ctrl|Alt|Shift|Super|CommandOrControl)\+)+(?:[A-Z0-9]|Space|F(?:[1-9]|1[0-9]|2[0-4])|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right)$/i.test(value)))throw new Error('Use a shortcut such as Control+Alt+O, or leave it empty.');
    clean[key]=value;
  }
  if(Object.hasOwn(patch,'statsPosition')){if(!['left','right','top'].includes(patch.statsPosition))throw new Error('Invalid stats position');clean.statsPosition=patch.statsPosition;}

  if(Object.hasOwn(patch,'petClickAction')){if(!['codex','animation','expand','reveal','toggle','chatgpt','none'].includes(patch.petClickAction))throw new Error('Invalid pet click action');clean.petClickAction=patch.petClickAction;}
  if(Object.hasOwn(patch,'compactChatTarget')) {
    if(!['codex','chatgpt'].includes(patch.compactChatTarget))throw new Error('Invalid compact chat target');
    clean.compactChatTarget=patch.compactChatTarget;
  }
  if(Object.hasOwn(patch,'linksLayoutVersion')) {if(patch.linksLayoutVersion!==2)throw new Error('Invalid links layout version');clean.linksLayoutVersion=2;}
  for (const key of ['note', 'petId', 'lastThreadId', 'projectPath', 'activeEditorTab', 'shortcutsView', 'timeFormat', 'dateFormat', 'theme']) {
    if (Object.hasOwn(patch, key)) {
      if (key === 'lastThreadId' && patch[key] === null) clean[key] = null;
      else if (typeof patch[key] === 'string' && patch[key].length <= 2000000) clean[key] = patch[key];
      else throw new Error(`Invalid ${key}`);
    }
  }
  for (const [key, fields] of Object.entries({ editorTabs: ['id','name','path','language','text','framework'], shortcuts: ['id','name','path','parentId','alias','icon'], terminalCommands: ['id','name','command'] })) {
    if (!Object.hasOwn(patch, key)) continue;
    if (!Array.isArray(patch[key]) || patch[key].length > 200) throw new Error(`Invalid ${key}`);
    clean[key] = patch[key].map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Invalid ${key} entry`);
      const result = {};
      for (const field of fields) {
        if (item[field] == null) { result[field] = field === 'path' || field === 'parentId' ? null : ''; continue; }
        if (typeof item[field] !== 'string' || item[field].length > (field === 'text' ? 5*1024*1024 : field === 'icon' ? 256*1024 : 8192)) throw new Error(`Invalid ${key}.${field}`);
        result[field] = item[field];
      }
      if (key === 'editorTabs') result.dirty = Boolean(item.dirty);
      if (key === 'shortcuts') {
        result.kind = ['group','folder','file','url'].includes(item.kind) ? item.kind : 'file';
        if(Object.hasOwn(item,'pinned') && typeof item.pinned!=='boolean')throw new Error('Invalid shortcut pin');
        result.pinned = item.pinned === true;
      }
      return result;
    });
    if(key==='shortcuts' && clean[key].filter(item=>item.pinned).length>7)throw new Error('Pin up to seven links to the toolbar.');
  }
  if (Object.hasOwn(patch, 'toolbarOrder')) {
    if (!Array.isArray(patch.toolbarOrder) || patch.toolbarOrder.some(x => typeof x !== 'string') || patch.toolbarOrder.length > 100) throw new Error('Invalid toolbar order');
    clean.toolbarOrder = [...new Set(patch.toolbarOrder)];
  }
  for (const key of ['statsClicks','statsKeys','statsCpu','statsRam','autoStart','alwaysOnTop','autoExpand','showTime','showDate','sidebarVisible']) if (Object.hasOwn(patch,key)) {
    if (typeof patch[key] !== 'boolean') throw new Error(`Invalid ${key}`);
    clean[key] = patch[key];
  }
  for (const [key, min, max] of [['petScale',0.5,2],['hoverDelay',500,10000],['autoCollapseDelay',1000,120000]]) if (Object.hasOwn(patch,key)) {
    if (!Number.isFinite(patch[key]) || patch[key] < min || patch[key] > max) throw new Error(`Invalid ${key}`);
    clean[key] = patch[key];
  }
  if (Object.hasOwn(patch, 'pinnedThreads')) {
    if (!Array.isArray(patch.pinnedThreads) || patch.pinnedThreads.length > 1000 || patch.pinnedThreads.some(x => typeof x !== 'string')) throw new Error('Invalid pins');
    clean.pinnedThreads = [...new Set(patch.pinnedThreads)];
  }
  if (Object.hasOwn(patch, 'drafts')) {
    if (!patch.drafts || typeof patch.drafts !== 'object' || Array.isArray(patch.drafts)) throw new Error('Invalid drafts');
    clean.drafts = Object.create(null);
    for (const [id, text] of Object.entries(patch.drafts)) {
      if (['__proto__', 'constructor', 'prototype'].includes(id) || typeof text !== 'string' || text.length > 2000000) throw new Error('Invalid draft');
      clean.drafts[id] = text;
    }
  }
  return clean;
}
class SettingsStore {
  constructor(file) {
    this.file = file;
    this.value = defaults();
    this.loadError = null;
    try { this.value = { ...this.value, ...validatePatch(JSON.parse(fs.readFileSync(file, 'utf8'))) }; }
    catch (error) { if (error.code !== 'ENOENT') this.loadError = error.message; }
    if(this.value.linksLayoutVersion!==2){this.value.shortcutsView='icons';this.value.linksLayoutVersion=2;}
  }
  update(patch) {
    const next = { ...this.value, ...validatePatch(patch) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(temporary, this.file);
    this.value = next;
    return this.value;
  }
}
module.exports = { SettingsStore, validatePatch };
