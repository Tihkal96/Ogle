'use strict';
// Match #pet/.pet-stage: bottom-origin scaling keeps the canvas top at -2.
function petBounds(bounds,scale=1){return {x:bounds.x+bounds.width/2-59*scale,y:bounds.y-2,width:118*scale,height:128*scale};}
function petCenter(bounds,scale=1){const pet=petBounds(bounds,scale);return {x:Math.round(pet.x+pet.width/2),y:Math.round(pet.y+pet.height/2)};}
function clampPet(bounds,area,scale=1){
  const pet=petBounds(bounds,scale);
  const offsetX=pet.x-bounds.x,offsetY=pet.y-bounds.y;
  const x=Math.max(Math.ceil(area.x-offsetX),Math.min(Math.round(bounds.x),Math.floor(area.x+area.width-offsetX-pet.width)));
  const y=Math.max(Math.ceil(area.y-offsetY),Math.min(Math.round(bounds.y),Math.floor(area.y+area.height-offsetY-pet.height)));
  return {...bounds,x,y};
}
function dockBounds(mode, bounds, area, scale = 1, pinnedSide = null) {
  const heights = { idle: 180, reveal: 216, quick: 386, picker: 506, expand: 820 };
  if (!Object.hasOwn(heights, mode)) throw new Error('Unknown dock layout');
  const width = Math.min(mode === 'expand' ? (pinnedSide && pinnedSide !== 'bottom' ? 1320 : 760) : mode === 'idle' ? Math.max(300, Math.round(118*scale+182)) : 600, area.width);
  // The narrow toolbar wraps below 480px of shell content (+26px window padding/borders).
  const toolbarExtra = width <= 506 && ['reveal','quick','picker'].includes(mode) ? 30 : 0;
  const height = Math.min(Math.round(heights[mode]+toolbarExtra+(mode==='expand' && pinnedSide==='bottom'?380:0)+(mode==='expand'?145:128)*(scale-1)),area.height);
  // Panels may extend offscreen; expanding them must not move the pet to fit.
  return clampPet({x:Math.round(bounds.x+bounds.width/2-width/2),y:bounds.y,width,height},area,scale);
}
module.exports={dockBounds,petBounds,petCenter,clampPet};
