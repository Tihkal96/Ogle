'use strict';
const {dockBounds}=require('./window-layout.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class WindowTransition {
  constructor(win,getArea,getScale){this.win=win;this.getArea=getArea;this.getScale=getScale;this.recovery=null;}
  async begin(mode,reducedMotion=false){
    const win=this.win,from=win.getBounds();
    const target=dockBounds(mode,from,this.getArea(from),this.getScale());
    if(['x','y','width','height'].every(key=>target[key]===from[key]))return {unchanged:true};
    // Move the existing surface to its final pet anchor before changing size.
    // Resizing and repositioning together exposes a stale DWM frame on Windows.
    const x=Math.round(target.x+target.width/2-from.width/2),y=target.y;
    if(!reducedMotion && (x!==from.x || y!==from.y)){
      const start=performance.now(),duration=180;
      for(;;){
        if(win.isDestroyed())return;
        const t=Math.min(1,(performance.now()-start)/duration),ease=1-Math.pow(1-t,3);
        win.setPosition(Math.round(from.x+(x-from.x)*ease),Math.round(from.y+(y-from.y)*ease),false);
        if(t===1)break;
        await pause(16);
      }
    }
    if(win.isDestroyed())return;
    win.setOpacity(0);
    clearTimeout(this.recovery);
    this.recovery=setTimeout(()=>this.finish(),2500);
    // Allow Windows to commit native transparency before moving its surface.
    await pause(32);
    return target;
  }
  finish(){clearTimeout(this.recovery);this.recovery=null;if(!this.win.isDestroyed())this.win.setOpacity(1);}
}
module.exports={WindowTransition};
