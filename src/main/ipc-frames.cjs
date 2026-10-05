'use strict';
// Fill each frame once. Repeated Buffer.concat on a large snapshot copies its
// entire accumulated history again for every incoming socket chunk.
class IpcFrames {
  constructor(maximum = 64 * 1024 * 1024) {
    this.maximum=maximum;this.header=Buffer.alloc(4);this.headerBytes=0;this.payload=null;this.payloadBytes=0;
  }
  push(chunk, consume) {
    let offset=0;
    while(offset<chunk.length) {
      if(!this.payload) {
        const count=Math.min(4-this.headerBytes,chunk.length-offset);
        chunk.copy(this.header,this.headerBytes,offset,offset+count);this.headerBytes+=count;offset+=count;
        if(this.headerBytes<4)continue;
        const size=this.header.readUInt32LE(0);this.headerBytes=0;
        if(!size || size>this.maximum)throw new Error('Invalid desktop IPC frame');
        this.payload=Buffer.allocUnsafe(size);this.payloadBytes=0;
      }
      const count=Math.min(this.payload.length-this.payloadBytes,chunk.length-offset);
      chunk.copy(this.payload,this.payloadBytes,offset,offset+count);this.payloadBytes+=count;offset+=count;
      if(this.payloadBytes===this.payload.length) {
        const frame=this.payload;this.payload=null;this.payloadBytes=0;consume(frame);
      }
    }
  }
}
module.exports={IpcFrames};
