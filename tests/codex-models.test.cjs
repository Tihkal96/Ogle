'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(value={}) {
  function element(){return {children:[],value:'',listeners:{},append(item){this.children.push(item)},replaceChildren(...items){this.children=items},addEventListener(type,fn){this.listeners[type]=fn}};}
  const modelSelect=element(),effortSelect=element(),window={},changes=[];
  const context=vm.createContext({window,document:{createElement:element}});
  vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/codex-models.js'),'utf8'),context);
  const picker=window.OgleCodexModels.create({modelSelect,effortSelect,value,onChange:value=>changes.push(value),api:{listModels:async()=>({data:[{model:'alpha',displayName:'Alpha',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'}]},{model:'beta',supportedReasoningEfforts:[{reasoningEffort:'medium'}]}]})}});
  return {picker,modelSelect,effortSelect,changes};
}
test('model picker restores saved supported effort after asynchronous catalog loading',async()=>{
  const f=fixture({model:'alpha',effort:'high'});await f.picker.load();
  assert.equal(f.modelSelect.value,'alpha');assert.equal(f.effortSelect.value,'high');assert.equal(f.picker.getOptions().effort,'high');
});
test('changing model replaces effort choices and inherits default until explicitly chosen',async()=>{
  const f=fixture({model:'alpha',effort:'high'});await f.picker.load();f.modelSelect.value='beta';f.modelSelect.listeners.change();
  assert.deepEqual(f.effortSelect.children.map(x=>x.value),['','medium']);assert.equal(f.picker.getOptions().effort,undefined);
  f.effortSelect.value='medium';f.effortSelect.listeners.change();assert.equal(f.picker.getOptions().effort,'medium');
  f.modelSelect.value='';f.modelSelect.listeners.change();assert.equal(f.effortSelect.disabled,true);assert.equal(f.picker.getOptions().model,undefined);
});
