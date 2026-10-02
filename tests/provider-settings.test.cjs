'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SettingsStore,validatePatch}=require('../src/main/settings.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ogle-provider-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return path.join(dir,'settings.json');}
test('first startup asks assistant choice and existing profiles preserve enabled providers',t=>{
 const file=fixture(t),fresh=new SettingsStore(file);assert.equal(fresh.value.assistantsConfigured,false);assert.equal(fresh.value.useCodex,true);assert.equal(fresh.value.useChatGPT,true);assert.equal(fresh.value.useClaude,false);
 fs.writeFileSync(file,JSON.stringify({compactChatTarget:'chatgpt',note:'keep me'}));const old=new SettingsStore(file);assert.equal(old.value.assistantsConfigured,true);assert.equal(old.value.useCodex,true);assert.equal(old.value.note,'keep me');
});
test('all providers may be disabled and choices plus model preferences survive restart',t=>{
 const file=fixture(t),store=new SettingsStore(file);const patch={useCodex:false,useChatGPT:false,useClaude:false,assistantsConfigured:true,codexModel:'gpt-6-astra',codexEffort:'high'};
 store.update({...patch,note:'unrelated note'});const next=new SettingsStore(file);for(const [key,value] of Object.entries(patch))assert.deepEqual(next.value[key],value);assert.equal(next.value.note,'unrelated note');next.update({useClaude:true});assert.equal(new SettingsStore(file).value.useClaude,true);
});
test('provider flags reject coercion and invalid settings updates leave disk unchanged',t=>{
 const file=fixture(t),store=new SettingsStore(file);store.update({useCodex:false});const before=fs.readFileSync(file,'utf8');
 for(const key of ['useCodex','useChatGPT','useClaude','assistantsConfigured'])for(const value of ['false',0,null,[],{}])assert.throws(()=>store.update({[key]:value}),/Invalid/);
 assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('model preferences reject nonstrings and oversized values',()=>{
 for(const key of ['codexModel','codexEffort'])for(const value of [null,5,[],{},'x'.repeat(161),'bad\nvalue'])assert.throws(()=>validatePatch({[key]:value}),/Invalid/);
});
