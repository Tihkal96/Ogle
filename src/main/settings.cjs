'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { shortcutKeys } = require('./global-shortcuts.cjs');
const defaults = () => ({ pinnedThreads: [], drafts: {}, note: '', petId: 'rinne-mini', petClickAction:'reveal', shortcutVisibility:'Control+Alt+O', shortcutPanel:'Control+Alt+Space', shortcutBar:'Control+Alt+B', shortcutChatTarget:'Control+Alt+T', shortcutCodex:'Control+Alt+C', shortcutGpt:'Control+Alt+G', shortcutEditor:'Control+Alt+E', shortcutShell:'Control+Alt+S', shortcutLinks:'Control+Alt+L', shortcutMappingVersion:2, shortcutPrompt:'Control+Alt+P', includeSearchFolders:false, statsVisible:true, statsBackground:false, statsTextTransparency:0, statsBackgroundTransparency:45, statsClicks:true, statsKeys:true, statsCpu:true, statsRam:true, statsCpuTemp:false, statsGpu:false, statsGpuClock:false, statsPosition:'right', alwaysOnTop: true, lastThreadId: null, projectPath: '', editorTabs: [], activeEditorTab: '', shortcuts: [], shortcutsView: 'icons', toolbarOrder: [], terminalCommands: [], autoExpand: false, autoCollapse: true, autoStart: true, hoverDelay: 3000, autoCollapseDelay: 7000, pinnedPanelSide: 'left', petScale: 1, showTime: true, showDate: false, timeFormat: '24h', dateFormat: 'locale', theme: 'dark', sidebarVisible: true });
function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings');
  const clean = {};
  if(Object.hasOwn(patch,'shortcutMappingVersion')) {if(patch.shortcutMappingVersion!==2)throw new Error('Invalid shortcut mapping version');clean.shortcutMappingVersion=2;}
  for(const key of shortcutKeys) if(Object.hasOwn(patch,key)) {
    const value=patch[key];
    if(typeof value!=='string' || value.length>80 || (value && !/^(?:(?:Control|Ctrl|Alt|Shift|Super|CommandOrControl)\+)+(?:[A-Z0-9]|Space|F(?:[1-9]|1[0-9]|2[0-4])|Home|End|Insert|Delete|PageUp|PageDown|Up|Down|Left|Right)$/i.test(value)))throw new Error('Use a shortcut such as Control+Alt+O, or leave it empty.');
    clean[key]=value;
  }
  if(Object.hasOwn(patch,'pinnedPanelSide')){if(!['left','right','bottom'].includes(patch.pinnedPanelSide))throw new Error('Invalid pinned panel position');clean.pinnedPanelSide=patch.pinnedPanelSide;}
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
    if (!Array.isArray(patch[key]) || (key!=='shortcuts' && patch[key].length > 200)) throw new Error(`Invalid ${key}`);
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
        if(result.kind==='group') {
          for(const [field,fallback] of [['columns',2],['rows',1]]) {
            const value=item[field] ?? fallback;
            if(!Number.isInteger(value)||value<1||value>16)throw new Error('Group '+field+' must be from 1 to 16.');
            result[field]=value;
          }
          result.layoutFlow=item.layoutFlow ?? 'rows';
          if(!['rows','columns'].includes(result.layoutFlow))throw new Error('Invalid group layout direction');
        }
      }
      return result;
    });
    if(key==='shortcuts' && clean[key].filter(item=>item.pinned).length>7)throw new Error('Pin up to seven links to the toolbar.');
  }
  if (Object.hasOwn(patch, 'toolbarOrder')) {
    if (!Array.isArray(patch.toolbarOrder) || patch.toolbarOrder.some(x => typeof x !== 'string') || patch.toolbarOrder.length > 100) throw new Error('Invalid toolbar order');
    clean.toolbarOrder = [...new Set(patch.toolbarOrder)];
  }
  for (const key of ['includeSearchFolders','statsVisible','statsBackground','statsClicks','statsKeys','statsCpu','statsRam','statsCpuTemp','statsGpu','statsGpuClock','autoStart','alwaysOnTop','autoExpand','autoCollapse','showTime','showDate','sidebarVisible']) if (Object.hasOwn(patch,key)) {
    if (typeof patch[key] !== 'boolean') throw new Error(`Invalid ${key}`);
    clean[key] = patch[key];
  }
  for (const [key, min, max] of [['statsTextTransparency',0,100],['statsBackgroundTransparency',0,100],['petScale',0.5,2],['hoverDelay',500,10000],['autoCollapseDelay',1000,120000]]) if (Object.hasOwn(patch,key)) {
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
    this.recoveryOriginal = null;
    this.loadReadFailed = false;
    let original;
    try {
      original = fs.readFileSync(file);
      const parsed = JSON.parse(original.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid settings');
      if(parsed.shortcutMappingVersion!==2) {
        const canonical=value=>typeof value==='string'?value.toLowerCase().replace(/^ctrl\+/,'control+'):'';
        const candidates={...parsed};
        const migrations=[['shortcutShell','Control+Alt+X','Control+Alt+S'],['shortcutLinks','Control+Alt+S','Control+Alt+L']];
        for(const [key,oldValue,newValue] of migrations)if(canonical(parsed[key])===canonical(oldValue))candidates[key]=newValue;
        // A user's custom binding wins over a replacement default.
        for(let pass=0;pass<migrations.length;pass++)for(const [key] of migrations)if(candidates[key]!==parsed[key]&&shortcutKeys.some(other=>other!==key&&canonical(candidates[other])===canonical(candidates[key])))candidates[key]=parsed[key];
        Object.assign(parsed,candidates,{shortcutMappingVersion:2});
      }
      // Reserve the newly requested Ctrl+Alt+G for ChatGPT, moving only the old default.
      if(!Object.hasOwn(parsed,'shortcutGpt') && /^(?:Control|Ctrl)\+Alt\+G$/i.test(parsed.shortcutChatTarget || '')) parsed.shortcutChatTarget='Control+Alt+T';
      // Existing custom accelerators win over new defaults instead of disabling every shortcut.
      const occupied=new Set(Object.entries(parsed).filter(([key,value])=>shortcutKeys.includes(key)&&typeof value==='string'&&value).map(([,value])=>value.toLowerCase().replace(/^ctrl\+/,'control+')));
      for(const key of shortcutKeys) if(!Object.hasOwn(parsed,key) && occupied.has(this.value[key].toLowerCase())) this.value[key]='';
      if(!Object.hasOwn(parsed,'autoCollapse'))this.value.autoCollapse=parsed.autoExpand!==false;
      const errors = [];
      // A damaged preference must not discard unrelated notes, drafts or tabs.
      for (const [key, value] of Object.entries(parsed)) {
        try { Object.assign(this.value, validatePatch({ [key]: value })); }
        catch (error) { errors.push(error.message); }
      }
      if (errors.length) { this.loadError = errors.join('; '); this.recoveryOriginal = original; }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.loadError = error.message;
        if (original) this.recoveryOriginal = original;
        else this.loadReadFailed = true;
      }
    }
    if(this.value.linksLayoutVersion!==2){this.value.linksLayoutVersion=2;}
  }
  update(patch) {
    const next = { ...this.value, ...validatePatch(patch) };
    if (this.loadReadFailed) throw new Error('Settings could not be read. Restart after restoring access before saving changes.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (this.recoveryOriginal !== null) {
      // Preserve the exact damaged input before the first successful replacement.
      const recovery = `${this.file}.recovery-${Date.now()}-${randomUUID()}.json`;
      fs.writeFileSync(recovery, this.recoveryOriginal, { flag: 'wx' });
      this.recoveryOriginal = null;
    }
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(temporary, this.file);
    this.value = next;
    return this.value;
  }
}
module.exports = { SettingsStore, validatePatch };
