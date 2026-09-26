'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {DockShortcuts}=require('../src/main/global-shortcuts.cjs');
test('shortcut changes invoke actions, roll back conflicts and release registrations',()=>{
 const registered=new Map();const calls=[];const registry={register(key,fn){if(key==='Control+Alt+X')return false;registered.set(key,fn);return true;},unregister(key){registered.delete(key);}};
 const shortcuts=new DockShortcuts(registry,{shortcutVisibility:()=>calls.push('visible'),shortcutPanel:()=>calls.push('panel')});
 shortcuts.configure({shortcutVisibility:'Control+Alt+O',shortcutPanel:'Control+Alt+Space'});
 registered.get('Control+Alt+O')();assert.deepEqual(calls,['visible']);
 assert.throws(()=>shortcuts.configure({shortcutVisibility:'Control+Alt+X'}),/already in use/);
 assert.equal(registered.size,2);assert.ok(registered.has('Control+Alt+O'));
 assert.throws(()=>shortcuts.configure({shortcutVisibility:'Control+Alt+O',shortcutPanel:'Control+Alt+O'}),/different/);
 shortcuts.configure({shortcutVisibility:'',shortcutPanel:'Control+Alt+Space'});assert.equal(registered.size,1);
 shortcuts.dispose();assert.equal(registered.size,0);
});
