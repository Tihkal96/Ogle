'use strict';
window.OgleBackgroundWork=class {
  constructor({run,delay,report=()=>{}}) {Object.assign(this,{run,delay,report});this.timer=null;this.busy=false;this.lastStart=-Infinity;this.arm();}
  arm(wait=this.delay()) {clearTimeout(this.timer);this.timer=null;if(wait!==null)this.timer=setTimeout(()=>this.tick(),wait);}
  async tick() {if(this.busy)return;this.busy=true;this.lastStart=Date.now();try {await this.run();}catch(error){this.report(error);}finally {this.busy=false;this.arm();}}
  wake() {if(this.delay()===null){this.arm(null);return;}if(!this.busy)this.arm(Math.max(0,2000-(Date.now()-this.lastStart)));}
};
