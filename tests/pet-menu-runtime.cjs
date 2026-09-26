'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
  const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`pet-menu-profile-${Date.now()}`);
  fs.mkdirSync(profile,{recursive:true});
  const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
  const exe=process.env.PETDOCK_TEST_EXE;
  const app=await electron.launch({...(exe?{executablePath:path.resolve(exe),args:[]}:{args:[root]}),env});
  try{
    const page=await app.firstWindow();
    await page.waitForFunction(()=>typeof window.dock?.petMenu==='function');
    await app.evaluate(({Menu})=>{
      const build=Menu.buildFromTemplate.bind(Menu);
      Menu.buildFromTemplate=(...args)=>{const menu=build(...args);global.__nativePetMenu=menu;return menu;};
    });
    const result=await page.evaluate(async()=>{try{return {ok:true,value:await window.dock.petMenu()};}catch(error){return {ok:false,error:error.message};}});
    const labels=await app.evaluate(({BrowserWindow})=>{
      const menu=global.__nativePetMenu;const labels=menu?.items.map(item=>item.label);
      menu?.closePopup(BrowserWindow.getAllWindows()[0]);return labels;
    });
    assert.deepEqual(result,{ok:true,value:true});
    assert.ok(labels.includes('Settings')&&labels.includes('Quit Ogle'));
    console.log(JSON.stringify({nativePetMenu:true,ipcCloneSafe:true,labels}));
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
