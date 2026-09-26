'use strict';
const {_electron:electron}=require('playwright');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`taskbar-profile-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});
  fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoExpand:false,petId:'rinnegan'}));
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[root],env});
  try {
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.locator('[data-setting="petId"]').waitFor({state:'attached',timeout:60000});
    await app.evaluate(({BrowserWindow})=>{global.__icons=[];const win=BrowserWindow.getAllWindows()[0],set=win.setIcon.bind(win);win.setIcon=image=>{global.__icons.push({size:image.getSize(),data:image.toDataURL()});set(image);};});
    await page.locator('#settings-button').evaluate(el=>el.click());
    await page.selectOption('[data-setting="petId"]','lago-cartoon');
    await page.waitForFunction(()=>petImage.src.includes('lago-cartoon')&&petImage.complete);
    const waitIcon=async()=>{for(let i=0;i<30;i++){const icon=await app.evaluate(()=>global.__icons.filter(i=>i.size.width===64&&i.size.height===64).at(-1));if(icon)return icon;await page.waitForTimeout(100);}throw new Error('No native icon update');};
    const lago=await waitIcon();await app.evaluate(()=>{global.__icons=[];});
    await page.selectOption('[data-setting="petId"]','rinnegan');
    await page.waitForFunction(()=>petImage.src.includes('rinnegan')&&petImage.complete);
    const rinne=await waitIcon();assert.notEqual(lago.data,rinne.data);assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(root,'artifacts/taskbar-idle-icon.png'),Buffer.from(rinne.data.split(',')[1],'base64'));
    console.log(JSON.stringify({nativeSetIcon:true,updatesWithSelectedPet:true,size:rinne.size,rendererErrors:errors}));
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
