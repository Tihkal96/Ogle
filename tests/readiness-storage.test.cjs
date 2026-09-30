'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {SettingsStore}=require('../src/main/settings.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ogle-recovery-'));
test('invalid preference preserves unrelated user data and original recovery copy',()=>{
 const dir=temp(),file=path.join(dir,'settings.json');
 try {
  const original=JSON.stringify({note:'irreplaceable note',drafts:{chat:'draft'},autoCollapseDelay:'bad',petId:'custom'});
  fs.writeFileSync(file,original);
  const store=new SettingsStore(file);
  assert.equal(store.value.note,'irreplaceable note');assert.equal(store.value.drafts.chat,'draft');assert.equal(store.value.petId,'custom');
  assert.ok(store.loadError);store.update({showTime:false});
  const copies=fs.readdirSync(dir).filter(x=>x.includes('.recovery-'));
  assert.equal(copies.length,1);assert.equal(fs.readFileSync(path.join(dir,copies[0]),'utf8'),original);
  assert.equal(new SettingsStore(file).value.note,'irreplaceable note');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('malformed JSON is preserved before defaults can overwrite it',()=>{
 const dir=temp(),file=path.join(dir,'settings.json');
 try {const original='{"note":"partial';fs.writeFileSync(file,original);const store=new SettingsStore(file);store.update({showDate:true});
 const backup=fs.readdirSync(dir).find(x=>x.includes('.recovery-'));assert.ok(backup);assert.equal(fs.readFileSync(path.join(dir,backup),'utf8'),original);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('non-UTF8 text is rejected without altering file while UTF8 round trips',async()=>{
 const dir=temp(),file=path.join(dir,'legacy.txt');
 const filename=path.join(__dirname,'../src/main/files.cjs'),localRequire=require('node:module').createRequire(filename);
 const source=fs.readFileSync(filename,'utf8');
 const box={module:{exports:{}},require:id=>id==='electron'?{}:localRequire(id),Buffer,AbortSignal,URL};vm.runInNewContext(source,box);
 const files=new box.module.exports.DockFiles(null);
 try {fs.writeFileSync(file,Buffer.from([0x63,0x61,0x66,0xe9]));await assert.rejects(files.read(file),/UTF-8/);assert.deepEqual(fs.readFileSync(file),Buffer.from([0x63,0x61,0x66,0xe9]));
 fs.writeFileSync(file,'café ☃');assert.equal((await files.read(file)).text,'café ☃');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('unreadable settings target cannot be overwritten with defaults',()=>{
 const dir=temp();
 try {const store=new SettingsStore(dir);assert.ok(store.loadError);assert.throws(()=>store.update({note:'replacement'}),/could not be read/);assert.equal(fs.statSync(dir).isDirectory(),true);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
