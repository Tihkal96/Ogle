'use strict';
// A visual flourish never changes the real work/attention state.
window.OgleIdleAnimation = class {
  constructor(random=Math.random,delay=60000){this.random=random;this.delay=delay;this.since=null;this.active=null;this.mode=null;}
  reset(now){this.since=now;this.active=null;}
  tick(now,mode,animations){
    // Boolean callers retain their idle-only API; only real idle/work modes qualify.
    mode=mode===true?'idle':mode;
    if(mode!=='idle'&&mode!=='running'){this.mode=null;this.reset(now);return null;}
    if(this.mode!==mode){this.mode=mode;this.reset(now);}
    if(this.since===null)this.since=now;
    if(this.active){
      if(now<this.active.until)return this.active;
      this.reset(now);return null;
    }
    if(now-this.since<this.delay)return null;
    // Use expressive rows, excluding work/wait/error signals.
    const choices=['waving','review'].filter(name=>animations[name]);
    if(!choices.length){this.reset(now);return null;}
    const name=choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))];
    const [,frames,duration]=animations[name];
    this.active={name,startedAt:now,until:now+frames*duration};
    return this.active;
  }
};
