'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validatePatch}=require('../src/main/settings.cjs');
const {historyMenuTemplate}=require('../src/main/history-menu.cjs');
test('project labels and hidden states validate and stay scoped to assistant',()=>{
 const input={projectNames:{codex:{'C:\\one':'One'},claude:{'C:\\one':'Claude One'}},hiddenProjects:{codex:{'C:\\one':true},claude:{'C:\\two':false}}},clean=validatePatch(input);
 assert.deepEqual(clean,input);input.projectNames.codex['C:\\one']='Changed';assert.equal(clean.projectNames.codex['C:\\one'],'One');
 const maximum=Object.fromEntries(Array.from({length:500},(_,i)=>['C:\\'+i,'Project']));assert.equal(Object.keys(validatePatch({projectNames:{codex:maximum}}).projectNames.codex).length,500);
 assert.throws(()=>validatePatch({projectNames:{codex:{...maximum,extra:'Extra'}}}),/project metadata/);
});
test('project metadata rejects malformed providers, paths, label values and hiding states',()=>{
 for(const value of [null,[],{unknown:{}},{codex:null},{codex:[]},{codex:{'':'Name'}},{codex:{['x'.repeat(4097)]:'Name'}},{codex:{path:''}},{codex:{path:'   '}},{codex:{path:12}},{codex:{path:'x'.repeat(161)}}])assert.throws(()=>validatePatch({projectNames:value}),/project metadata/);
 for(const value of [{codex:{path:'yes'}},{claude:{path:0}},{chatgpt:{path:true}}])assert.throws(()=>validatePatch({hiddenProjects:value}),/project metadata/);
});
test('native history menus use recoverable conversation removal and project labels/hiding',()=>{
 for(const provider of ['codex','claude']){
  const conversation=historyMenuTemplate({provider,kind:'conversation',id:'real-session'}),project=historyMenuTemplate({provider,kind:'project',cwd:'C:\\project'}),all=historyMenuTemplate({provider,kind:'all'});
  assert.deepEqual(conversation.filter(x=>x.action).map(x=>x.action),['rename','archive','archives','show-hidden']);
  assert.deepEqual(project.filter(x=>x.action).map(x=>x.action),['rename','hide','archives','show-hidden']);
  assert.match(project[0].label,/label/);assert.match(project[1].label,/Ogle/);
  assert.deepEqual(all.map(x=>x.action),['archives','show-hidden']);assert.equal([...conversation,...project].some(x=>x.action==='delete'),false);
 }
});
test('native history menus reject invalid targets before constructing Electron menu items',()=>{
 for(const target of [null,{provider:'chatgpt',kind:'all'},{provider:'codex',kind:'other'},{provider:'codex',kind:'conversation',id:''},{provider:'claude',kind:'conversation',id:'x'.repeat(161)},{provider:'claude',kind:'project',cwd:''},{provider:'codex',kind:'project',cwd:'x'.repeat(4097)}])assert.throws(()=>historyMenuTemplate(target),/Invalid/);
});
