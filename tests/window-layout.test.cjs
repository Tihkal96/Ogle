'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {dockBounds}=require('../src/main/window-layout.cjs');
test('compact reveal preserves pet center and top while prompt grows below',()=>{
  const area={x:0,y:0,width:1920,height:1040},idle={x:800,y:100,width:220,height:180};
  const reveal=dockBounds('reveal',idle,area);
  assert.equal(reveal.x+reveal.width/2,idle.x+idle.width/2);assert.equal(reveal.y,100);
  const quick=dockBounds('quick',reveal,area);
  assert.equal(quick.y,reveal.y);assert.equal(reveal.height,216);assert.equal(quick.height,386);
  assert.deepEqual(dockBounds('idle',quick,area),idle);
});
test('every layout stays on small secondary displays with scaled pets',()=>{
  const area={x:-800,y:0,width:800,height:600};
  for(const mode of ['idle','reveal','quick','picker','expand'])for(const scale of [.5,1,2]){
    const box=dockBounds(mode,{x:-180,y:500,width:220,height:200},area,scale);
    assert.ok(box.x>=area.x&&box.y>=area.y);
    assert.ok(box.x+box.width<=area.x+area.width&&box.y+box.height<=area.height);
  }
});
