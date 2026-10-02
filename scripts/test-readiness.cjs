'use strict';
// Local isolated regression suite. It never sends a real chat prompt or requests elevation.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),report=[];
const checks=[
 ['unit',['--test',...fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.cjs')).map(name=>'tests/'+name)]],
 ...['topmost','chatgpt-activity','panel-view','zoom-scroll','codex-scroll','window-shape','shortcuts-settings','dock-workflows','codex-independent','codex-cold-start','codex-completion','shortcuts-modularity','shortcut-icons','selection-app','selection-editor','selection-terminal','selection-chatgpt','readiness-commands','readiness-editor','readiness-find','readiness-settings','readiness-links-shell','readiness-stream','readiness-idle','readiness-history','readiness-shutdown','chat-find','codex-responsive','codex-queue','pet-interactions','pinned-panel','auto-collapse','editor-highlight','keyboard-selection'].map(name=>[name,['tests/'+name+'-runtime.cjs']])
];
for(const [name,args] of checks){
 const start=Date.now();process.stdout.write('\nChecking '+name+'\n');
 const result=spawnSync(process.execPath,args,{cwd:root,env:process.env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
 report.push({name,passed:result.status===0,seconds:Math.round((Date.now()-start)/100)/10,error:result.error?.message});
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts','readiness-results.json'),JSON.stringify({at:new Date().toISOString(),packagedExecutable:process.env.PETDOCK_TEST_EXE||null,checks:report},null,2));
 if(result.status!==0){process.exitCode=1;break;}
}
