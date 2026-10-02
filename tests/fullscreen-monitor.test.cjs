'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createFullscreenMonitor}=require('../src/main/fullscreen-monitor.cjs');
function fixture(){const values=[],child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={end(){child.ended=true;}};child.kill=()=>child.killed=true;let options;const monitor=createFullscreenMonitor(value=>values.push(value),{platform:'win32',launch:(exe,args,opts)=>{options=opts;return child;}});return{values,child,options,monitor};}
test('native monitor handles split samples, emits only state changes and cleans up',()=>{
 const f=fixture();f.child.stdout.emit('data','1');f.child.stdout.emit('data','\r\n1\r\n0\r\n');assert.deepEqual(f.values,[true,false]);assert.equal(f.options.windowsHide,true);
 f.monitor.dispose();assert.equal(f.child.ended,true);assert.equal(f.child.killed,true);f.child.stdout.emit('data','1\n');assert.deepEqual(f.values,[true,false]);
});
test('failed native detection never enables blind periodic raises',()=>{const f=fixture();f.child.emit('error',new Error('unavailable'));f.child.emit('exit',1);assert.deepEqual(f.values,[null]);f.monitor.dispose();});

