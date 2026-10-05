'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(action,result={}) {
 const state={settings:{projectNames:{codex:{'C:/One':'First'},claude:{'C:/Two':'Second'}},hiddenProjects:{codex:{'C:/Old':true},claude:{'C:/Other':true}}}},saved=[],calls=[],errors=[],window={};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/history-menu.js'),'utf8'),{window,document:{}});
 const menu=window.OgleHistoryMenu.init({state,api:{historyMenu:async()=>action,removeConversation:async(...args)=>{calls.push(args);return result}},save:async partial=>{saved.push(partial);Object.assign(state.settings,partial)},refresh:async provider=>calls.push(provider),report:error=>errors.push(error)});
 return {menu,state,saved,calls,errors};
}
test('project hiding preserves other projects and providers and never removes a conversation',async()=>{
 const f=fixture('hide');await f.menu.open({provider:'codex',kind:'project',cwd:'C:/One'});
 assert.equal(f.menu.hidden('codex','C:/One'),true);assert.equal(f.menu.hidden('claude','C:/Other'),true);assert.equal(f.menu.hidden('codex','C:/Old'),true);assert.deepEqual(f.calls,['codex']);assert.equal(f.menu.label('claude','C:/Two'),'Second');assert.equal(f.menu.label('codex','C:/Folder'),'Folder');
});
test('show-hidden clears only the chosen provider',async()=>{
 const f=fixture('show-hidden');await f.menu.open({provider:'codex',kind:'all'});assert.equal(f.menu.hidden('codex','C:/Old'),false);assert.equal(f.menu.hidden('claude','C:/Other'),true);
});
test('cancelled conversation removal does not refresh; accepted removal refreshes provider',async()=>{
 const f=fixture('archive',{cancelled:true});await f.menu.open({provider:'codex',kind:'conversation',id:'one'});assert.deepEqual(f.calls,[['codex','one']]);
 const g=fixture('archive',{});await g.menu.open({provider:'claude',kind:'conversation',id:'two'});assert.deepEqual(g.calls,[['claude','two'],'claude']);
});
