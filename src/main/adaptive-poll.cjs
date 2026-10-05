'use strict';

// Idle checks may sleep; active work and recent interaction keep the fast path.
class AdaptivePoll {
  constructor(run, {activeMs=900, visibleMs=1800, idleMs=15000, graceMs=30000,
    now=Date.now, schedule=setTimeout, cancel=clearTimeout}={}) {
    Object.assign(this,{run,activeMs,visibleMs,idleMs,graceMs,now,schedule,cancel});
    this.visible=true; this.working=false; this.busy=false; this.stopped=false;
    this.graceUntil=0; this.lastWake=-Infinity; this.timer=null;
    this.arm(this.activeMs);
  }
  delay() {
    return this.working || this.now()<this.graceUntil ? this.activeMs :
      this.visible ? this.visibleMs : this.idleMs;
  }
  arm(delay=this.delay()) {
    if(this.stopped)return;
    this.cancel(this.timer);
    this.timer=this.schedule(()=>this.tick(),delay);
    this.timer?.unref?.();
  }
  async tick() {
    if(this.stopped || this.busy)return;
    this.busy=true;
    try {await this.run();} finally {this.busy=false;this.arm();}
  }
  context({visible=this.visible,working=this.working}={}) {
    const changed=this.visible!==visible || this.working!==working;
    this.visible=visible; this.working=working;
    if(changed&&!this.busy)this.arm();
  }
  wake() {const now=this.now();this.graceUntil=now+this.graceMs;if(!this.busy && now-this.lastWake>=this.activeMs){this.lastWake=now;this.arm(0);}}
  dispose() {this.stopped=true;this.cancel(this.timer);this.timer=null;}
}
module.exports={AdaptivePoll};
