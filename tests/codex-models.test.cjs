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

test('catalog is cached and identical settings do not rebuild native options',async()=>{
  const f=fixture({model:'alpha',effort:'high'});await f.picker.load();
  const children=f.modelSelect.children;
  await f.picker.load();f.picker.setValue({model:'alpha',effort:'high'});
  assert.equal(f.modelSelect.children,children);
});
test('desktop settings sync by thread and preserve a local choice until switching threads',async()=>{
  const f=fixture();await f.picker.load();f.picker.setThreadValue({threadId:'one',model:'alpha',effort:'high'});
  assert.equal(f.modelSelect.value,'alpha');assert.equal(f.effortSelect.value,'high');
  f.modelSelect.value='beta';f.modelSelect.listeners.change();
  f.picker.setThreadValue({threadId:'one',model:'alpha',effort:'low'});assert.equal(f.modelSelect.value,'beta');
  f.picker.setThreadValue({threadId:'two',model:'alpha',effort:'low'});assert.equal(f.modelSelect.value,'alpha');assert.equal(f.effortSelect.value,'low');
});
test('slow catalog does not replace an open native model menu and concurrent loads share the request',async()=>{
  function element(){return {children:[],value:'',listeners:{},append(item){this.children.push(item)},replaceChildren(...items){this.children=items},addEventListener(type,fn){this.listeners[type]=fn}};}
  const modelSelect=element(),effortSelect=element(),window={},document={createElement:element,activeElement:null};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/codex-models.js'),'utf8'),{window,document});
  let resolve,calls=0;
  const picker=window.OgleCodexModels.create({modelSelect,effortSelect,api:{listModels(){calls++;return new Promise(done=>resolve=done)}}});
  const initial=modelSelect.children;document.activeElement=modelSelect;
  const first=picker.load(),second=picker.load();assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
  resolve({data:[{model:'alpha'}]});await first;assert.equal(modelSelect.children,initial);
  document.activeElement=null;modelSelect.listeners.blur();assert.equal(modelSelect.children.length,2);
  await picker.load();assert.equal(calls,1);
});
