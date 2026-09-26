'use strict';
const {fileURLToPath}=require('node:url');
function idleIcon(nativeImage,pet) {
  if(!pet?.spriteUrl)return null;
  const atlas=nativeImage.createFromPath(fileURLToPath(pet.spriteUrl));
  if(atlas.isEmpty())return null;
  const {width,height}=atlas.getSize();
  if(width%8||height%11)return null;
  return atlas.crop({x:0,y:0,width:width/8,height:height/11}).resize({height:64,quality:'best'});
}
function pngToIco(png,width=64,height=64) {
  const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
  header[6]=width===256?0:width;header[7]=height===256?0:height;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  return Buffer.concat([header,png]);
}
module.exports={idleIcon,pngToIco};
