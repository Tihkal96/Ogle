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

test('up to five shortcut pins persist and excess pins are rejected atomically',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogle-pins-')),file=path.join(dir,'settings.json');
  try {
    const store=new SettingsStore(file);
    const shortcuts=Array.from({length:5},(_,i)=>({id:String(i),name:`Link ${i}`,path:`https://example.com/${i}`,kind:'url',pinned:true}));
    store.update({shortcuts});
    assert.equal(new SettingsStore(file).value.shortcuts.filter(item=>item.pinned).length,5);
    assert.throws(()=>store.update({shortcuts:[...shortcuts,{id:'six',kind:'group',name:'Six',pinned:true}]}),/five links/);
    assert.equal(new SettingsStore(file).value.shortcuts.length,5);
    assert.throws(()=>validatePatch({shortcuts:[{id:'x',pinned:'true'}]}),/shortcut pin/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('icon-layout migration is once-only and startup defaults on',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petdock-migrate-')),file=path.join(dir,'settings.json');
  try {
    fs.writeFileSync(file,JSON.stringify({shortcutsView:'details',shortcuts:[{id:'g',kind:'group',name:'Tools'}]}));
    const old=new SettingsStore(file);assert.equal(old.value.shortcutsView,'icons');assert.equal(old.value.autoStart,true);assert.equal(old.value.shortcuts[0].name,'Tools');
    old.update({shortcutsView:'details',autoStart:false});
    const reopened=new SettingsStore(file);assert.equal(reopened.value.shortcutsView,'details');assert.equal(reopened.value.autoStart,false);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('notes, independent drafts and pins survive reopening', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petdock-test-'));
  const file = path.join(dir, 'settings.json');
  const store = new SettingsStore(file);
  assert.equal(store.value.petId, 'rinne-mini');
  assert.equal(store.value.autoCollapseDelay, 10000);
  store.update({ note: 'my note\nsecond line', drafts: { one: 'draft 1', two: 'draft 2' }, pinnedThreads: ['two'] });
  store.update({ petId: 'lago-cartoon' });
  store.update({ autoCollapseDelay: 12000 });
  const reopened = new SettingsStore(file);
  assert.equal(reopened.value.autoCollapseDelay, 12000);
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
