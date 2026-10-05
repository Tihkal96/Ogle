'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {IpcFrames}=require('../src/main/ipc-frames.cjs');
function framed(bytes){const header=Buffer.alloc(4);header.writeUInt32LE(bytes.length);return Buffer.concat([header,bytes]);}
test('IPC decoder preserves large fragmented frames and following frames in order',()=>{
  const large=Buffer.alloc(4*1024*1024,93),tiny=Buffer.from('next');
  const wire=Buffer.concat([framed(large),framed(tiny)]),frames=new IpcFrames(),received=[];
  for(let i=0;i<wire.length;i+=997)frames.push(wire.subarray(i,i+997),frame=>received.push(frame));
  assert.deepEqual(received,[large,tiny]);assert.equal(frames.payload,null);
});
test('IPC decoder handles single-byte headers and rejects zero or oversized frames',()=>{
  const wire=framed(Buffer.from('abc')),frames=new IpcFrames(),received=[];
  for(const byte of wire)frames.push(Buffer.from([byte]),frame=>received.push(frame.toString()));
  assert.deepEqual(received,['abc']);
  assert.throws(()=>new IpcFrames().push(Buffer.alloc(4),()=>{}),/Invalid/);
  const header=Buffer.alloc(4);header.writeUInt32LE(65*1024*1024);
  assert.throws(()=>new IpcFrames().push(header,()=>{}),/Invalid/);
});
