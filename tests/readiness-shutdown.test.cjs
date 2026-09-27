'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {GracefulShutdown}=require('../src/main/shutdown.cjs');
const live=()=>({isDestroyed:()=>false,webContents:{isDestroyed:()=>false,isCrashed:()=>false}});
test('concurrent closes share one flush and successful completion permits shutdown',async()=>{
 let finish,calls=0;const shutdown=new GracefulShutdown({window:live(),flush:()=>{calls++;return new Promise(resolve=>finish=resolve);}});
 const one=shutdown.request(),two=shutdown.request();assert.equal(one,two);await Promise.resolve();assert.equal(calls,1);finish(true);assert.equal(await one,true);assert.equal(shutdown.ready,true);assert.equal(await shutdown.request(),true);assert.equal(calls,1);
});
test('failed and timed-out saves keep the app open and permit retry',async()=>{
 const reports=[];const shutdown=new GracefulShutdown({window:live(),timeoutMs:15,flush:()=>new Promise(()=>{}),report:error=>reports.push(error.message)});
 assert.equal(await shutdown.request(),false);assert.equal(shutdown.ready,false);assert.match(reports[0],/too long/);
 shutdown.flush=async()=>{throw new Error('Disk unavailable');};assert.equal(await shutdown.request(),false);assert.equal(shutdown.ready,false);assert.equal(reports[1],'Disk unavailable');
 shutdown.flush=async()=>false;assert.equal(await shutdown.request(),false);assert.equal(shutdown.ready,false);
 shutdown.flush=async()=>true;assert.equal(await shutdown.request(),true);
});
test('destroyed or crashed renderer does not hang shutdown',async()=>{
 for(const kind of ['destroyed','crashed']){const window=live();if(kind==='destroyed')window.webContents.isDestroyed=()=>true;else window.webContents.isCrashed=()=>true;
 const shutdown=new GracefulShutdown({window,flush:()=>{throw new Error('Must not execute');}});assert.equal(await shutdown.request(),true);}
});
