'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture() {
  const element=()=>({attrs:{},title:'',textContent:'',writes:0,hasAttribute(key){return key in this.attrs},getAttribute(key){return this.attrs[key]??null},setAttribute(key,value){this.attrs[key]=value;this.writes++},removeAttribute(key){delete this.attrs[key];this.writes++}});
  const buttons={chats:element(),chatgpt:element(),claude:element()},status=element(),window={};
  const document={querySelector(selector){return buttons[selector.match(/"([^"]+)"/)[1]]},getElementById(){return status}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/assistant-activity.js'),'utf8'),{window,document});
  return {buttons,status,render:window.OgleAssistantActivity.render};
}
test('simultaneous provider activity has independent accessible indicators',()=>{
  const f=fixture();f.render({codex:true,chatgpt:'done',claude:'waiting'});
  assert.equal(f.buttons.chats.attrs['data-activity'],'working');assert.equal(f.buttons.chatgpt.attrs['data-activity'],'done');assert.equal(f.buttons.claude.attrs['data-activity'],'waiting');
  assert.equal(f.buttons.chatgpt.attrs['aria-label'],'ChatGPT · Done');assert.equal(f.status.textContent,'Done');
  const writes=f.buttons.chatgpt.writes;f.render({codex:true,chatgpt:'done',claude:'waiting'});assert.equal(f.buttons.chatgpt.writes,writes);
});
test('idle clears badges and a load failure gives a recovery hint without replacing other providers',()=>{
  const f=fixture();f.render({codex:true,chatgpt:'working'});f.render({codex:true,chatgpt:'idle',pageFailed:true,pageMessage:'Unable to connect'});
  assert.equal(f.buttons.chatgpt.attrs['data-activity'],'failed');assert.equal(f.buttons.chats.attrs['data-activity'],'working');assert.equal(f.status.textContent,'Load failed · reload to retry');assert.equal(f.status.title,'Unable to connect');
  f.render();assert.equal(f.buttons.chatgpt.hasAttribute('data-activity'),false);assert.equal(f.buttons.chatgpt.attrs['aria-label'],'ChatGPT');assert.equal(f.status.textContent,'');
});
