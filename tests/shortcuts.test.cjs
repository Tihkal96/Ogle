'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/renderer/shortcuts.js');
const items = [{id:'a',kind:'group',parentId:null},{id:'b',kind:'group',parentId:'a'},{id:'link',kind:'url',parentId:'b'},{id:'other',kind:'file',parentId:null}];
test('nested group cannot be dragged inside itself or a descendant',()=>{assert.equal(model.canMove(items,'a','a'),false);assert.equal(model.canMove(items,'a','b'),false);assert.throws(()=>model.move(items,'a','b'));assert.equal(model.canMove(items,'link','other'),false);});
test('moving link to root preserves other groups and supports sibling reordering',()=>{const moved=model.move(items,'link',null,'other');assert.equal(moved.find(x=>x.id==='link').parentId,null);assert.equal(moved.at(-2).id,'link');assert.equal(items.find(x=>x.id==='link').parentId,'b');});
test('removing a group retains its children at the parent level',()=>{const remaining=model.remove(items,'b');assert.equal(remaining.length,3);assert.equal(remaining.find(x=>x.id==='link').parentId,'a');assert.equal(remaining.find(x=>x.id==='a').parentId,null);});
