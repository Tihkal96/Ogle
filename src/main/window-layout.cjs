'use strict';
function dockBounds(mode, bounds, area, scale = 1, pinnedSide = null) {
  const heights = { idle: 180, reveal: 216, quick: 386, picker: 506, expand: 820 };
  if (!Object.hasOwn(heights, mode)) throw new Error('Unknown dock layout');
  const width = Math.min(mode === 'expand' ? (pinnedSide && pinnedSide !== 'bottom' ? 1320 : 760) : mode === 'idle' ? Math.max(300, Math.round(118*scale+182)) : 600, area.width);
  const height = Math.min(Math.round(heights[mode]+(mode==='expand' && pinnedSide==='bottom'?380:0)+(mode==='expand'?145:128)*(scale-1)),area.height);
  return { x: Math.round(Math.max(area.x,Math.min(bounds.x+bounds.width/2-width/2,area.x+area.width-width))),
    y: Math.round(Math.max(area.y,Math.min(bounds.y,area.y+area.height-height))),width,height };
}
module.exports={dockBounds};
