'use strict';
// Trailing debounce plus a deadline prevents continuous typing postponing saves.
window.OgleAutosave=class {
  constructor(save,{delay=400,maxWait=1500,report=()=>{}}={}) {
    Object.assign(this,{save,delay,maxWait,report});this.trailing=null;this.deadline=null;
  }
  schedule() {
    clearTimeout(this.trailing);
    this.trailing=setTimeout(()=>this.flush().catch(this.report),this.delay);
    if(!this.deadline)this.deadline=setTimeout(()=>this.flush().catch(this.report),this.maxWait);
  }
  cancel() {clearTimeout(this.trailing);clearTimeout(this.deadline);this.trailing=this.deadline=null;}
  flush() {this.cancel();return Promise.resolve().then(this.save);}
};
