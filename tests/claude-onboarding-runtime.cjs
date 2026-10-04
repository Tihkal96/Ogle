'use strict';
// Exercise only the official CLI's cosmetic theme picker in an isolated profile.
// Stop before selecting a login method, accepting terms/trust or sending a task.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {ClaudeBridge,discoverClaude}=require('../src/main/claude-bridge.cjs');
const plain=text=>text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g,'');
(async()=>{
  const executable=await discoverClaude();if(!executable){console.log(JSON.stringify({skipped:true,reason:'Claude Code is not installed'}));return;}
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ogle-theme-check-'));let bridge;
  try{
    let raw='',id;
    bridge=new ClaudeBridge({dataDir:dir,executable,env:{...process.env,CLAUDE_CONFIG_DIR:path.join(dir,'config')},onEvent:event=>{
      if(event.event!=='data')return;raw+=event.data;
      // Same standard cursor-position response that xterm supplies in the app.
      if(id&&event.data.includes('\x1b[6n'))bridge.write(id,'\x1b[1;1R');
    }});
    const session=await bridge.create({cwd:dir,cols:100,rows:30});id=session.id;
    const until=async check=>{const end=Date.now()+20000;while(Date.now()<end){if(check())return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Official Claude onboarding did not reach the expected screen.');};
    await until(()=>/Choose the text style|Choose.*theme|Dark mode|Light mode/i.test(plain(raw)));
    const before=raw.length;bridge.write(id,'\x1b[B');await until(()=>raw.length>before);
    bridge.write(id,'\x1b[A');await new Promise(resolve=>setTimeout(resolve,200));
    const enterAt=raw.length;bridge.write(id,'\r');await until(()=>/Select login method/i.test(plain(raw.slice(enterAt))));
    assert.ok(raw.length>enterAt);
    console.log(JSON.stringify({passed:true,officialCli:true,isolatedProfile:true,themeArrowResponds:true,enterAdvancesToLogin:true,stoppedBeforeLogin:true}));
  }finally{bridge?.dispose();await new Promise(resolve=>setTimeout(resolve,300));await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
