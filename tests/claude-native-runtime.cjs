'use strict';
// Local official-CLI-shaped fixture: verifies the real ConPTY boundary without
// installing Claude, authenticating, contacting a model or changing a project.
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');
async function run(bridgeModule){
  const {ClaudeBridge}=require(bridgeModule||'../src/main/claude-bridge.cjs');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ogle-claude-native-'));let bridge;
  try{
    const cli=path.join(dir,'fixture.cmd');
    await fs.writeFile(cli,'@echo off\r\npowershell.exe -NoProfile -File "%~dp0fixture.ps1" %*\r\n');
    await fs.writeFile(path.join(dir,'fixture.ps1'),String.raw`
$settingsPath = $args[([Array]::IndexOf($args, '--settings') + 1)]
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
Write-Host 'OGLE-CLAUDE-FIXTURE-READY'
foreach ($hookEvent in @('SessionStart', 'UserPromptSubmit', 'Stop')) {
  $hookCommand = $settings.hooks.$hookEvent[0].hooks[0].command
  $encoded = ($hookCommand -split ' ')[-1]
  @{hook_event_name=$hookEvent;session_id='7b04f05e-7a12-4a37-a535-5a12e50a64dd'} | ConvertTo-Json -Compress | powershell.exe -WindowStyle Hidden -NoProfile -NonInteractive -EncodedCommand $encoded
  Start-Sleep -Milliseconds 150
}
Write-Host 'OGLE-CLAUDE-FIXTURE-DONE'
Start-Sleep -Milliseconds 600
`);
    const events=[];bridge=new ClaudeBridge({dataDir:dir,executable:cli,onEvent:e=>events.push(e),pollMs:50});
    const session=await bridge.create({cwd:dir,cols:90,rows:24});
    bridge.resize(session.id,100,30);
    const deadline=Date.now()+15000;
    while(Date.now()<deadline&&!events.some(e=>e.event==='exit'))await new Promise(r=>setTimeout(r,50));
    const output=events.filter(e=>e.event==='data').map(e=>e.data).join('');
    assert.ok(output.includes('OGLE-CLAUDE-FIXTURE-READY'),output);
    assert.ok(output.includes('OGLE-CLAUDE-FIXTURE-DONE'),output);
    assert.ok(events.some(e=>e.event==='session'&&e.resume==='7b04f05e-7a12-4a37-a535-5a12e50a64dd'));
    assert.ok(events.some(e=>e.state==='working'));assert.ok(events.some(e=>e.state==='done'));
    assert.ok(events.some(e=>e.event==='exit'&&e.exitCode===0));
    assert.equal((await bridge.status()).active.length,0);
    console.log(JSON.stringify({passed:true,realConPTY:true,output:true,sessionId:true,working:true,done:true,cleanExit:true}));
  }finally{bridge?.dispose();await fs.rm(dir,{recursive:true,force:true});}
}
async function packaged(executable){
  const {spawn,spawnSync}=require('node:child_process');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ogle-claude-package-'));
  try{
    const bridgeModule=path.join(path.dirname(path.resolve(executable)),'resources','app.asar','src','main','claude-bridge.cjs');
    const main=path.join(dir,'main.cjs');
    await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({name:'ogle-claude-native-test',main:'main.cjs'}));
    await fs.writeFile(main,`const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(dir,'profile'))});app.whenReady().then(()=>require(${JSON.stringify(__filename)}).run(${JSON.stringify(bridgeModule)})).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});`);
    const check=spawnSync(process.execPath,['--check',main],{encoding:'utf8',windowsHide:true});assert.equal(check.status,0,check.stderr);
    const env={...process.env,PETDOCK_DATA_DIR:path.join(dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve,reject)=>{
      // A packaged Electron executable always starts its packaged app. Use the
      // matching development runtime to exercise shipped ASAR code and native
      // dependencies without ever starting Ogle against the user's profile.
      const child=spawn(require('electron'),[dir],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      const timeout=setTimeout(()=>{child.kill();reject(new Error('Packaged Claude terminal test timed out'));},25000);
      child.stdout.on('data',data=>process.stdout.write(data));child.stderr.on('data',data=>process.stderr.write(data));
      child.on('error',error=>{clearTimeout(timeout);reject(error);});child.on('close',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error(`Packaged Claude terminal test exited ${code}`));});
    });
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={run};
if(require.main===module)(process.env.PETDOCK_TEST_EXE?packaged(process.env.PETDOCK_TEST_EXE):run()).catch(error=>{console.error(error);process.exitCode=1;});
