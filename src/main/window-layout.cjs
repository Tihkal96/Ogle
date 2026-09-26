'use strict';
function dockBounds(mode, bounds, area, scale = 1) {
  const heights = { idle: 180, reveal: 180, quick: 350, picker: 470, expand: 820 };
  if (!Object.hasOwn(heights, mode)) throw new Error('Unknown dock layout');
  const width = Math.min(mode === 'expand' ? 760 : mode === 'idle' ? Math.max(220, Math.round(192*scale+24)) : 600, area.width);
  const height = Math.min(Math.round(heights[mode]+(mode==='expand'?145:128)*(scale-1)),area.height);
  return { x: Math.round(Math.max(area.x,Math.min(bounds.x+bounds.width/2-width/2,area.x+area.width-width))),
    y: Math.round(Math.max(area.y,Math.min(bounds.y,area.y+area.height-height))),width,height };
}
module.exports={dockBounds};
