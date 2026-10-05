'use strict';
const {Worker}=require('node:worker_threads'),path=require('node:path');
class PersistenceWorker{
 constructor(){this.worker=null;this.pending=new Map();this.id=0;}
 run(job){if(!this.worker){const filename=path.join(__dirname,'persistence-worker.cjs').replace(/app\.asar([\\/])/,'app.asar.unpacked$1');this.worker=new Worker(filename);const worker=this.worker;this.worker.on('message',message=>{const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);if(message.error)pending.reject(new Error(message.error));else pending.resolve(message.result);if(!this.pending.size)this.worker?.unref();});const fail=error=>{if(this.worker!==worker)return;for(const item of this.pending.values())item.reject(error);this.pending.clear();this.worker=null;};this.worker.on('error',fail);this.worker.on('exit',code=>{if(this.worker!==worker)return;if(this.pending.size)fail(new Error('Persistence worker stopped before saving.'));this.worker=null;});}this.worker.ref();const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});try{this.worker.postMessage({...job,id});}catch(error){this.pending.delete(id);if(!this.pending.size)this.worker.unref();reject(error);}});}
 async dispose(){if(this.worker){await this.worker.terminate();this.worker=null;}}
}
module.exports={PersistenceWorker};
