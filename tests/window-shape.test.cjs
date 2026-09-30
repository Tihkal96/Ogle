'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeRegions,containsPoint}=require('../src/main/window-shape.cjs');
test('empty pet-stage space is outside the input region in each dock size',()=>{
  for(const width of [220,600,1200]){
    const regions=normalizeRegions([{x:width/2-59,y:0,width:118,height:128},{x:12,y:128,width:width-24,height:400}],width,540);
    assert.equal(containsPoint(regions,15,50),false);
    assert.equal(containsPoint(regions,width-15,50),false);
    assert.equal(containsPoint(regions,width/2,50),true);
    assert.equal(containsPoint(regions,15,200),true);
  }
});
test('region clipping preserves edge controls and rejects malformed IPC',()=>{
  assert.deepEqual(normalizeRegions([{x:-2,y:-4,width:20.3,height:30.2}],100,100),[{x:0,y:0,width:19,height:27}]);
  assert.deepEqual(normalizeRegions([{x:120,y:0,width:30,height:10}],100,100),[]);
  assert.throws(()=>normalizeRegions([{x:NaN,y:0,width:1,height:1}],10,10));
  assert.throws(()=>normalizeRegions(Array(65).fill({}),10,10));
});
