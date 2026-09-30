'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore, validatePatch } = require('../src/main/settings.cjs');

test('compact chat target accepts only explicit Codex or ChatGPT choices',()=>{
  assert.deepEqual(validatePatch({compactChatTarget:'codex'}),{compactChatTarget:'codex'});
  assert.deepEqual(validatePatch({compactChatTarget:'chatgpt'}),{compactChatTarget:'chatgpt'});
  assert.throws(()=>validatePatch({compactChatTarget:'other'}),/compact chat target/);
});

test('up to seven shortcut pins persist and excess pins are rejected atomically',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogle-pins-')),file=path.join(dir,'settings.json');
  try {
    const store=new SettingsStore(file);
    const shortcuts=Array.from({length:7},(_,i)=>({id:String(i),name:`Link ${i}`,path:`https://example.com/${i}`,kind:'url',pinned:true}));
    store.update({shortcuts});
    assert.equal(new SettingsStore(file).value.shortcuts.filter(item=>item.pinned).length,7);
    assert.throws(()=>store.update({shortcuts:[...shortcuts,{id:'eight',kind:'group',name:'Eight',pinned:true}]}),/seven links/);
    assert.equal(new SettingsStore(file).value.shortcuts.length,7);
    assert.throws(()=>validatePatch({shortcuts:[{id:'x',pinned:'true'}]}),/shortcut pin/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('layout migration preserves an explicit view and startup defaults on',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petdock-migrate-')),file=path.join(dir,'settings.json');
  try {
    fs.writeFileSync(file,JSON.stringify({shortcutsView:'details',shortcuts:[{id:'g',kind:'group',name:'Tools'}]}));
    const old=new SettingsStore(file);assert.equal(old.value.shortcutsView,'details');assert.equal(old.value.autoStart,true);assert.equal(old.value.shortcuts[0].name,'Tools');
    old.update({shortcutsView:'details',autoStart:false});
    const reopened=new SettingsStore(file);assert.equal(reopened.value.shortcutsView,'details');assert.equal(reopened.value.autoStart,false);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('notes, independent drafts and pins survive reopening', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petdock-test-'));
  const file = path.join(dir, 'settings.json');
  const store = new SettingsStore(file);
  assert.equal(store.value.petId, 'rinne-mini');
  assert.equal(store.value.autoCollapseDelay, 7000);
  store.update({ note: 'my note\nsecond line', drafts: { one: 'draft 1', two: 'draft 2' }, pinnedThreads: ['two'] });
  store.update({ petId: 'lago-cartoon' });
  assert.equal(store.value.pinnedPanelSide, 'left');
  store.update({ autoCollapseDelay: 12000, pinnedPanelSide: 'bottom' });
  const reopened = new SettingsStore(file);
  assert.equal(reopened.value.autoCollapseDelay, 12000);
  assert.equal(reopened.value.pinnedPanelSide, 'bottom');
  for(const side of ['left','right','bottom'])assert.equal(validatePatch({pinnedPanelSide:side}).pinnedPanelSide,side);
  assert.throws(()=>validatePatch({pinnedPanelSide:'top'}),/pinned panel position/);
  assert.throws(()=>validatePatch({autoCollapseDelay:999}),/autoCollapseDelay/);
  assert.throws(()=>validatePatch({autoCollapseDelay:120001}),/autoCollapseDelay/);
  assert.equal(reopened.value.note, 'my note\nsecond line');
  assert.equal(reopened.value.drafts.one, 'draft 1');
  assert.equal(reopened.value.drafts.two, 'draft 2');
  assert.deepEqual(reopened.value.pinnedThreads, ['two']);
  fs.rmSync(dir, { recursive: true });
});
test('invalid settings cannot overwrite saved content', () => {
  assert.throws(() => validatePatch({ drafts: JSON.parse('{"__proto__":"bad"}') }));
  assert.throws(() => validatePatch({ pinnedThreads: [12] }));
  assert.deepEqual(validatePatch({ unexpected: 'ignored' }), {});
});

test('pet click actions validate and preserve a chosen behavior',()=>{
 for(const value of ['codex','animation','expand','reveal','toggle','chatgpt','none'])assert.equal(validatePatch({petClickAction:value}).petClickAction,value);
 assert.throws(()=>validatePatch({petClickAction:'execute script'}),/pet click action/);
});

test('hover and automatic collapse migrate together then persist independently',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogle-behavior-')),file=path.join(dir,'settings.json');
 try{fs.writeFileSync(file,JSON.stringify({autoExpand:false}));const store=new SettingsStore(file);assert.equal(store.value.autoCollapse,false);store.update({autoCollapse:true});const reopened=new SettingsStore(file);assert.equal(reopened.value.autoExpand,false);assert.equal(reopened.value.autoCollapse,true);assert.throws(()=>validatePatch({autoCollapse:'yes'}));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('group shape and sibling order survive a profile restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogle-groups-')),file=path.join(dir,'settings.json');
 try{const store=new SettingsStore(file);store.update({shortcuts:[{id:'b',kind:'group',rows:3,columns:2,layoutFlow:'columns'},{id:'a',kind:'group',rows:1,columns:6}]});const groups=new SettingsStore(file).value.shortcuts;assert.deepEqual(groups.map(g=>g.id),['b','a']);assert.equal(groups[0].rows,3);assert.equal(groups[0].columns,2);assert.equal(groups[0].layoutFlow,'columns');for(const rows of [0,17,1.2])assert.throws(()=>validatePatch({shortcuts:[{kind:'group',rows}]}));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('new direct shortcuts migrate old target switch without overwriting custom shortcuts',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ogle-keys-'));
 try {
  const file=path.join(directory,'settings.json');
  fs.writeFileSync(file,JSON.stringify({shortcutChatTarget:'Control+Alt+G'}));
  const settings=new SettingsStore(file).value;
  assert.equal(settings.shortcutChatTarget,'Control+Alt+T');assert.equal(settings.shortcutGpt,'Control+Alt+G');
  assert.equal(settings.shortcutCodex,'Control+Alt+C');assert.equal(settings.shortcutEditor,'Control+Alt+E');assert.equal(settings.shortcutShell,'Control+Alt+S');assert.equal(settings.shortcutLinks,'Control+Alt+L');assert.equal(settings.shortcutPrompt,'Control+Alt+P');
  fs.writeFileSync(file,JSON.stringify({shortcutChatTarget:'Control+Alt+F8',shortcutVisibility:'Control+Alt+C'}));
  const custom=new SettingsStore(file).value;
  assert.equal(custom.shortcutChatTarget,'Control+Alt+F8');assert.equal(custom.shortcutVisibility,'Control+Alt+C');assert.equal(custom.shortcutCodex,'');
  assert.deepEqual(validatePatch({shortcutPrompt:'',shortcutEditor:'Control+Alt+E'}),{shortcutEditor:'Control+Alt+E',shortcutPrompt:''});
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('Shell and Links defaults migrate once and preserve custom accelerator conflicts',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ogle-shell-links-')),file=path.join(directory,'settings.json');
 try {
  fs.writeFileSync(file,JSON.stringify({shortcutShell:'Control+Alt+X',shortcutLinks:'Control+Alt+S'}));
  const store=new SettingsStore(file);assert.equal(store.value.shortcutShell,'Control+Alt+S');assert.equal(store.value.shortcutLinks,'Control+Alt+L');
  store.update({shortcutShell:'Control+Alt+X',shortcutLinks:'Control+Alt+F9'});
  const reopened=new SettingsStore(file);assert.equal(reopened.value.shortcutShell,'Control+Alt+X');assert.equal(reopened.value.shortcutLinks,'Control+Alt+F9');
  fs.writeFileSync(file,JSON.stringify({shortcutShell:'Control+Alt+X',shortcutLinks:'Control+Alt+S',shortcutVisibility:'Control+Alt+L'}));
  const conflict=new SettingsStore(file).value;assert.equal(conflict.shortcutVisibility,'Control+Alt+L');assert.equal(conflict.shortcutLinks,'Control+Alt+S');assert.equal(conflict.shortcutShell,'Control+Alt+X');
  fs.writeFileSync(file,JSON.stringify({shortcutShell:'',shortcutLinks:'Control+Alt+F8'}));
  const custom=new SettingsStore(file).value;assert.equal(custom.shortcutShell,'');assert.equal(custom.shortcutLinks,'Control+Alt+F8');
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
