'use strict';
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {pngToIco}=require('../src/main/pet-icon.cjs');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'artifacts/icon-build-profile'));
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  try {
    await win.loadFile(path.join(root,'scripts/icon-canvas.html'));
    const sprite=pathToFileURL(path.join(root,'assets/pets/rinnegan/spritesheet.webp')).href;
    const png=await win.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify(sprite)};await image.decode();const c=document.createElement('canvas');c.width=c.height=64;const w=image.naturalWidth/8,h=image.naturalHeight/11,s=Math.min(64/w,64/h);c.getContext('2d').drawImage(image,0,0,w,h,(64-w*s)/2,(64-h*s)/2,w*s,h*s);return c.toDataURL('image/png');})()`);
    fs.writeFileSync(path.join(root,'assets/petdock.ico'),pngToIco(Buffer.from(png.split(',')[1],'base64')));
    console.log('Built idle-frame application icon');
  } finally {win.destroy();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
