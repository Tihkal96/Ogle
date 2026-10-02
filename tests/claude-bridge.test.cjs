'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
const {ClaudeBridge,discoverClaude,activityFor,INSTALL_COMMAND}=require('../src/main/claude-bridge.cjs');
const ID='7b04f05e-7a12-4a37-a535-5a12e50a64dd';
async function fixture(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ogle-claude-'));const cli=path.join(dir,'claude.exe');await fs.writeFile(cli,'fixture');const events=[],spawns=[];const pty={spawn(file,args,options){const p={onData(fn){this.data=fn;},onExit(fn){this.exit=fn;},write(data){this.written=data;},resize(c,r){this.dimensions=[c,r];},kill(){this.killed=true;}};spawns.push({file,args,options,p});return p;}};const b=new ClaudeBridge({dataDir:dir,homeDir:dir,executable:cli,env:{SystemRoot:process.env.SystemRoot},pty,onEvent:e=>events.push(e),pollMs:60000});return {dir,cli,b,events,spawns,async cleanup(){b.dispose();await fs.rm(dir,{recursive:true,force:true});}};}

test('official Claude terminal preserves interactive CLI and uses only session-local hooks',async()=>{const f=await fixture();try{
  const s=await f.b.create({cwd:f.dir,cols:110,rows:30,resume:ID,model:'sonnet'});const start=f.spawns[0];assert.equal(start.file,f.cli);assert.equal(start.args.includes('--print'),false);assert.equal(start.args.some(a=>a.includes('skip-permissions')),false);assert.equal(start.args.at(-1),'sonnet');assert.equal(start.options.cols,110);
  const settings=JSON.parse(await fs.readFile(start.args[1],'utf8'));assert.ok(settings.hooks.UserPromptSubmit);assert.ok(settings.hooks.PermissionRequest);assert.equal(settings.hooks.PostToolUse[0].hooks[0].async,true);assert.equal(settings.hooks.Stop[0].hooks[0].async,undefined);assert.equal((await fs.readdir(f.dir)).includes('settings.json'),false);
  start.p.data('terminal output');assert.equal(f.events.at(-1).data,'terminal output');f.b.write(s.id,'/model\r');assert.equal(start.p.written,'/model\r');f.b.resize(s.id,1,999);assert.deepEqual(start.p.dimensions,[2,500]);
  assert.equal((await f.b.create({cwd:f.dir,resume:ID})).id,s.id);assert.equal(f.spawns.length,1);f.b.close(s.id);assert.equal(start.p.killed,true);assert.equal((await f.b.status()).active.length,0);
}finally{await f.cleanup();}});

test('hook lifecycle drives working, waiting, completion and ignores subagent stops',async()=>{const f=await fixture();try{
 const s=await f.b.create({cwd:f.dir});const dir=f.b.sessions.get(s.id).hook.dir;
 const states=[['UserPromptSubmit','working'],['PermissionRequest','waiting'],['PostToolUse','working'],['Stop','done'],['PostToolUse','done'],['SessionEnd','idle']];
 for(let i=0;i<states.length;i++){await fs.writeFile(path.join(dir,`${1000+i}-${ID}.event.json`),JSON.stringify({event:states[i][0],sessionId:ID}));await f.b.poll();assert.equal(f.events.filter(e=>e.type==='claude-activity').at(-1).state,states[i][1]);}
 assert.equal((await f.b.status()).active[0].resume,ID);assert.equal(activityFor({event:'Stop',agentId:'subagent'}),null);assert.equal(activityFor({event:'Notification',notification:'auth_success'}),null);assert.equal(activityFor({event:'Notification',notification:'permission_prompt'}),'waiting');
}finally{await f.cleanup();}});

test('history reads bounded local transcript metadata and omits subagent transcripts',async()=>{const f=await fixture();try{
 const project=path.join(f.dir,'.claude','projects','project');await fs.mkdir(path.join(project,ID,'subagents'),{recursive:true});const file=path.join(project,ID+'.jsonl');
 await fs.writeFile(file,[{type:'user',cwd:f.dir,message:{content:'Build example'}},{type:'custom-title',customTitle:'My project'}].map(JSON.stringify).join('\n'));
 await fs.writeFile(path.join(project,ID,'subagents','agent-side.jsonl'),JSON.stringify({cwd:f.dir}));
 let list=await f.b.listThreads();assert.equal(list.threads.length,1);assert.equal(list.threads[0].title,'My project');assert.equal(list.threads[0].id,ID);assert.equal(list.projects[0].path,f.dir);
 await fs.appendFile(file,'\n'+JSON.stringify({type:'custom-title',customTitle:'Renamed'}));list=await f.b.listThreads();assert.equal(list.threads[0].title,'Renamed');
}finally{await f.cleanup();}});

test('terminal /clear or /resume updates its current session without a stale hook reverting it',async()=>{const f=await fixture();try{
 const s=await f.b.create({cwd:f.dir,resume:ID});const dir=f.b.sessions.get(s.id).hook.dir;
 const next='9b04f05e-7a12-4a37-a535-5a12e50a64dd';
 async function hook(number,event,sessionId,agentId){await fs.writeFile(path.join(dir,`${number}-${ID}.event.json`),JSON.stringify({event,sessionId,agentId}));await f.b.poll();}
 await hook(1000,'SessionStart',next);assert.equal((await f.b.status()).active[0].resume,next);assert.equal(f.events.filter(e=>e.event==='session').at(-1).resume,next);
 await hook(1001,'PostToolUse',ID);await hook(1002,'SessionStart',ID,'subagent');assert.equal((await f.b.status()).active[0].resume,next);
 assert.equal((await f.b.create({cwd:f.dir,resume:next})).id,s.id);assert.equal(f.spawns.length,1);
}finally{await f.cleanup();}});

test('CLI discovery and setup are explicit, missing installation never starts an installer',async()=>{const f=await fixture();try{
 const missing=path.join(f.dir,'missing.exe');f.b.executable=missing;assert.equal((await f.b.status()).installed,false);await assert.rejects(f.b.create({cwd:f.dir}),/Install Claude/);assert.equal(f.spawns.length,0);
 await f.b.create({cwd:f.dir,setup:true});assert.equal(f.spawns.length,1);const args=f.spawns[0].args;assert.equal(Buffer.from(args.at(-1),'base64').toString('utf16le'),INSTALL_COMMAND);await assert.rejects(f.b.create({cwd:f.dir,setup:true}),/already open/);
 const local=path.join(f.dir,'.local','bin');await fs.mkdir(local,{recursive:true});await fs.writeFile(path.join(local,'claude.exe'),'fixture');assert.equal(await discoverClaude({homeDir:f.dir,env:{}}),path.join(local,'claude.exe'));
}finally{await f.cleanup();}});

test('actual PowerShell hook writes only lifecycle metadata and never makes a permission decision',{skip:process.platform!=='win32'},async()=>{const f=await fixture();try{
 const s=await f.b.create({cwd:f.dir});const settings=JSON.parse(await fs.readFile(f.spawns[0].args[1],'utf8'));const command=settings.hooks.PermissionRequest[0].hooks[0].command;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',command.split(' ').at(-1)],{input:JSON.stringify({hook_event_name:'PermissionRequest',session_id:ID,prompt:'must never persist',tool_input:{password:'private'}}),encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');const dir=f.b.sessions.get(s.id).hook.dir;const eventFile=(await fs.readdir(dir)).find(n=>n.endsWith('.event.json'));const content=await fs.readFile(path.join(dir,eventFile),'utf8');assert.equal(content.includes('private'),false);assert.equal(content.includes('persist'),false);assert.equal(JSON.parse(content).event,'PermissionRequest');
 await f.b.poll();assert.equal(f.events.filter(e=>e.type==='claude-activity').at(-1).state,'waiting');
}finally{await f.cleanup();}});

test('hook command works when Claude launches it through Git Bash',{skip:process.platform!=='win32'},async context=>{const f=await fixture();try{
 const bash=path.join(process.env.ProgramFiles||'C:\\Program Files','Git','bin','bash.exe');try{await fs.access(bash);}catch{context.skip('Git Bash not installed');return;}
 const s=await f.b.create({cwd:f.dir});const settings=JSON.parse(await fs.readFile(f.spawns[0].args[1],'utf8'));const command=settings.hooks.UserPromptSubmit[0].hooks[0].command;
 const result=spawnSync(bash,['-c',command],{input:JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:ID}),encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');await f.b.poll();assert.equal(f.events.filter(e=>e.type==='claude-activity').at(-1).state,'working');
}finally{await f.cleanup();}});
