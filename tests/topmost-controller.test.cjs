'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {TopmostController}=require('../src/main/topmost-controller.cjs');
class Window extends EventEmitter {
  constructor(name,log){super();Object.assign(this,{name,log,visible:true,minimized:false,destroyed:false});}
  isDestroyed(){return this.destroyed;} isVisible(){return this.visible;} isMinimized(){return this.minimized;}
  setAlwaysOnTop(value){this.log.push([this.name,'topmost',value]);}
  moveTop(){this.log.push([this.name,'raise']);}
  focus(){throw Error('must not steal focus');} show(){throw Error('must not reveal hidden window');}
}
function setup(){const log=[],timers=new Map();let id=0;const win=new Window('dock',log),child=new Window('auth',log);const controller=new TopmostController(win,{monitor:fn=>{fn(false);return{dispose(){}};},children:()=>[child],setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:id=>timers.delete(id)});const flush=()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}};return{log,timers,win,child,controller,flush};}
test('topmost recovery is bounded, debounced, nonactivating and keeps auth above dock',()=>{const s=setup();for(let i=0;i<50;i++)s.win.emit('blur');assert.equal(s.timers.size,3);s.log.length=0;s.flush();assert.equal(s.timers.size,0);assert.deepEqual(s.log.slice(0,4),[['dock','topmost',true],['dock','raise'],['auth','topmost',true],['auth','raise']]);assert.equal(s.log.length,12);s.controller.dispose();});
test('disabled, hidden, minimized and suspended windows are not raised',()=>{const s=setup();s.log.length=0;s.controller.setSuspended(true);assert.equal(s.timers.size,0);s.win.emit('blur');s.flush();assert.equal(s.log.length,0);s.controller.setSuspended(false);s.win.visible=false;s.flush();assert.equal(s.log.length,0);s.win.visible=true;s.win.minimized=true;s.win.emit('restore');s.flush();assert.equal(s.log.length,0);s.controller.setEnabled(false);s.log.length=0;s.win.emit('show');s.flush();assert.equal(s.log.length,0);s.controller.dispose();});
test('closing disposes listeners and pending work',()=>{const s=setup();s.win.emit('closed');assert.equal(s.timers.size,0);assert.equal(s.win.listenerCount('blur'),0);s.win.emit('show');assert.equal(s.timers.size,0);});

test('late override guard runs only while visible, requested and unsuspended',()=>{
  const log=[],guards=new Map();let next=0;const win=new Window('dock',log);
  const c=new TopmostController(win,{monitor:fn=>{fn(false);return{dispose(){}};},setTimer:()=>1,clearTimer:()=>{},setGuard:fn=>{guards.set(++next,fn);return next;},clearGuard:id=>guards.delete(id)});
  assert.equal(guards.size,1);log.length=0;[...guards.values()][0]();assert.deepEqual(log,[['dock','topmost',true],['dock','raise']]);
  win.visible=false;win.emit('hide');assert.equal(guards.size,0);
  win.visible=true;win.emit('show');assert.equal(guards.size,1);
  c.setSuspended(true);assert.equal(guards.size,0);c.setSuspended(false);assert.equal(guards.size,1);
  c.setEnabled(false);assert.equal(guards.size,0);c.dispose();
});


test('fullscreen yields once and suppresses every recovery path until it ends',()=>{
 const s=setup();s.flush();s.log.length=0;
 s.controller.setFullscreen(true);
 assert.deepEqual(s.log,[['dock','topmost',false],['auth','topmost',false]]);
 s.log.length=0;
 for(let i=0;i<5;i++){s.win.emit('blur');s.win.emit('show');s.controller.reassert();s.flush();}
 assert.deepEqual(s.log,[],'fullscreen must never be covered by guard or transition retries');
 s.controller.setFullscreen(false);s.flush();
 assert.ok(s.log.some(row=>row[0]==='dock'&&row[1]==='raise'));
 s.controller.dispose();
});
test('startup waits for foreground classification and disabled preference survives fullscreen',()=>{
 const log=[],win=new Window('dock',log);let report,disposed=false;
 const c=new TopmostController(win,{monitor:fn=>{report=fn;return{dispose(){disposed=true;}};},setTimer:()=>1,clearTimer:()=>{}});
 c.reassert();assert.ok(!log.some(row=>row[1]==='raise'));assert.ok(!log.some(row=>row[1]==='topmost'&&row[2]===true),'Startup must not flash over fullscreen before the first native sample');
 report(true);c.setEnabled(false);log.length=0;report(false);c.reassert();assert.deepEqual(log,[['dock','topmost',false]]);
 c.dispose();assert.equal(disposed,true);
});

test('unknown native state retains ordinary topmost without periodic raising',()=>{
 const s=setup();s.flush();s.log.length=0;s.controller.setFullscreen(null);
 assert.deepEqual(s.log,[['dock','topmost',true],['auth','topmost',true]]);
 s.log.length=0;s.controller.reassert();s.win.emit('blur');s.flush();assert.deepEqual(s.log,[]);s.controller.dispose();
});
