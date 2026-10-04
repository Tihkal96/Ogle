'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {dockBounds,petBounds,clampPet,petCenter}=require('../src/main/window-layout.cjs');
function visible(box,area,scale){const p=petBounds(box,scale);assert.ok(p.x>=area.x&&p.y>=area.y);assert.ok(p.x+p.width<=area.x+area.width&&p.y+p.height<=area.y+area.height);}
test('compact reveal preserves pet center and top while prompt grows below',()=>{
 const area={x:0,y:0,width:1920,height:1040},idle={x:760,y:100,width:300,height:180};
 const reveal=dockBounds('reveal',idle,area),quick=dockBounds('quick',reveal,area);
 assert.deepEqual(petCenter(reveal),petCenter(idle));assert.equal(quick.y,reveal.y);
 assert.equal(reveal.height,216);assert.equal(quick.height,386);assert.deepEqual(dockBounds('idle',quick,area),idle);
});
test('all layouts keep only the scaled pet inside negative-origin displays',()=>{
 const area={x:-800,y:-600,width:800,height:600};
 for(const mode of ['idle','reveal','quick','picker','expand'])for(const scale of [.5,1,2])for(const x of [-1000,-180,200])for(const y of [-900,-100,100]){
  const box=dockBounds(mode,{x,y,width:300,height:200},area,scale);visible(box,area,scale);
 }
});
test('expansion and side panels may overhang without displacing an in-bounds pet',()=>{
 const area={x:0,y:0,width:1920,height:1040};
 const idle={x:1802,y:914,width:118,height:180};
 for(const mode of ['reveal','quick','picker','expand'])for(const side of [null,'left','right','bottom']){
  const box=dockBounds(mode,idle,area,1,side);visible(box,area,1);
  assert.deepEqual(petCenter(box),petCenter(idle));
  assert.ok(box.x+box.width>area.width);assert.ok(box.y+box.height>area.height);
 }
});
test('drag clamps pet on all edges while allowing panel outside work area',()=>{
 const area={x:-1920,y:100,width:1920,height:1000};
 for(const scale of [.5,1,2])for(const x of [-3000,1000])for(const y of [-1000,2000]){
  const box=clampPet({x,y,width:1320,height:820},area,scale);visible(box,area,scale);
  assert.equal(box.width,1320);assert.equal(box.height,820);
 }
 const left=clampPet({x:-3000,y:200,width:760,height:820},area);assert.ok(left.x<area.x);
});

test('narrow compact modes reserve the second toolbar row without changing normal widths or expanded height',()=>{
 const bounds={x:0,y:0,width:600,height:216},normal={x:0,y:0,width:1920,height:1080},narrow={...normal,width:430};
 for(const mode of ['reveal','quick','picker'])assert.equal(dockBounds(mode,bounds,narrow).height,dockBounds(mode,bounds,normal).height+30);
 assert.equal(dockBounds('expand',bounds,narrow).height,dockBounds('expand',bounds,normal).height);
});
