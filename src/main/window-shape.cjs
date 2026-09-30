'use strict';
// A transparent BrowserWindow is still a rectangular input target on Windows.
// Use a native region so empty space falls through without pointer polling races.
function normalizeRegions(rects, width, height) {
  if (!Array.isArray(rects) || rects.length > 64) throw new Error('Invalid window regions');
  return rects.map(rect => {
    if (!rect || !['x','y','width','height'].every(key => Number.isFinite(rect[key]))) throw new Error('Invalid window region');
    const x=Math.max(0,Math.floor(rect.x)),y=Math.max(0,Math.floor(rect.y));
    const right=Math.min(width,Math.ceil(rect.x+Math.max(0,rect.width))),bottom=Math.min(height,Math.ceil(rect.y+Math.max(0,rect.height)));
    return {x,y,width:Math.max(0,right-x),height:Math.max(0,bottom-y)};
  }).filter(rect=>rect.width>0&&rect.height>0);
}
function containsPoint(regions,x,y) {return regions.some(r=>x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height);}
module.exports={normalizeRegions,containsPoint};
