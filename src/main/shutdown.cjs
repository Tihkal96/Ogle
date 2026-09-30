'use strict';
class GracefulShutdown {
  constructor({window,flush,report=()=>{},timeoutMs=5000}) {
    Object.assign(this,{window,flush,report,timeoutMs});this.ready=false;this.pending=null;
  }
  request() {
    if(this.ready)return Promise.resolve(true);
    if(this.pending)return this.pending;
    if(this.window.isDestroyed() || this.window.webContents.isDestroyed() || this.window.webContents.isCrashed()) {this.ready=true;return Promise.resolve(true);}
    this.pending=(async()=>{
      let timer;
      try {
        const result=await Promise.race([
          Promise.resolve().then(()=>this.flush()),
          new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Saving is taking too long. Ogle stayed open so you can retry closing it.')),this.timeoutMs);})
        ]);
        this.ready=result===true;return this.ready;
      } catch(error) {
        if(this.window.isDestroyed() || this.window.webContents.isDestroyed() || this.window.webContents.isCrashed()){this.ready=true;return true;}
        try{this.report(error);}catch{}return false;
      }finally{clearTimeout(timer);this.pending=null;}
    })();
    return this.pending;
  }
}
module.exports={GracefulShutdown};
