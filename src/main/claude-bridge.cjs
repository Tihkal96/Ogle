'use strict';
// A terminal host for the user's official Claude Code CLI. Authentication,
// permissions, model selection and commands remain inside that CLI.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTALL_COMMAND='irm https://claude.ai/install.ps1 | iex';
const size=(v,fallback)=>Number.isInteger(v)?Math.max(2,Math.min(500,v)):fallback;
const psLiteral=value=>"'"+String(value).replace(/'/g,"''")+"'";
const encoded=script=>Buffer.from(script,'utf16le').toString('base64');

async function discoverClaude({homeDir=os.homedir(),env=process.env,executable}={}){
  const candidates=executable?[executable]:[
    path.join(homeDir,'.local','bin','claude.exe'),
    path.join(homeDir,'.local','bin','claude'),
    ...(env.APPDATA?[path.join(env.APPDATA,'npm','claude.cmd')]:[]),
    ...String(env.Path||env.PATH||'').split(path.delimiter).filter(Boolean).flatMap(p=>['claude.exe','claude.cmd'].map(n=>path.join(p.replace(/^"|"$/g,''),n)))
  ];
  for(const candidate of [...new Set(candidates)]){try{if((await fs.stat(candidate)).isFile())return path.resolve(candidate);}catch{}}
  return null;
}
function activityFor(event){
  if(event.agentId)return null;
  if(event.event==='UserPromptSubmit'||event.event==='PostToolUse'||event.event==='PostToolUseFailure')return 'working';
  if(event.event==='PermissionRequest')return 'waiting';
  if(event.event==='Notification'&&event.notification==='permission_prompt')return 'waiting';
  if(event.event==='Stop')return 'done';
  if(event.event==='StopFailure')return 'failed';
  if(event.event==='SessionEnd'||event.event==='SessionStart')return 'idle';
  return null;
}
async function readEdges(file,stat){
  const handle=await fs.open(file,'r');try{
    const first=Buffer.alloc(Math.min(stat.size,131072));await handle.read(first,0,first.length,0);
    if(stat.size<=first.length)return first.toString('utf8');
    const last=Buffer.alloc(Math.min(stat.size-first.length,65536));await handle.read(last,0,last.length,stat.size-last.length);
    return first.toString('utf8').replace(/[^\n]*$/,'')+'\n'+last.toString('utf8').replace(/^[^\n]*\n/,'');
  }finally{await handle.close();}
}
function transcriptInfo(text,id,mtime){
  let cwd='',title='',first='';
  for(const line of text.split('\n')){try{
    const row=JSON.parse(line);if(row.isSidechain)continue;
    if(typeof row.cwd==='string')cwd=row.cwd;
    if(row.type==='custom-title'&&typeof row.customTitle==='string')title=row.customTitle;
    if(!title&&row.type==='summary'&&typeof row.summary==='string')title=row.summary;
    if(!first&&row.type==='user'){
      const c=row.message?.content;
      if(typeof c==='string')first=c;
      else if(Array.isArray(c))first=c.filter(b=>b.type==='text').map(b=>b.text||'').join(' ');
      if(first.startsWith('<'))first='';
    }
  }catch{}}
  return cwd?{id,cwd,title:(title||first||'Claude conversation').replace(/\s+/g,' ').slice(0,180),updatedAt:mtime}:null;
}

class ClaudeBridge{
  constructor({onEvent=()=>{},dataDir,homeDir=os.homedir(),env=process.env,executable,pty,pollMs=400}={}){
    Object.assign(this,{onEvent,homeDir,env,executable,pty,pollMs});
    this.dataDir=path.resolve(dataDir||path.join(os.tmpdir(),'ogle-claude'));
    this.sessions=new Map();this.historyCache=new Map();this.pendingCreates=new Map();this.pollTimer=null;this.polling=false;this.disposed=false;
  }
  emit(event){if(!this.disposed)this.onEvent(event);}
  async status(){const executable=await discoverClaude(this);return {installed:!!executable,executable,active:[...this.sessions.values()].map(({id,cwd,resume,state,setup})=>({id,cwd,resume,state,setup})),installCommand:INSTALL_COMMAND};}
  async listThreads(){
    const root=path.join(this.env.CLAUDE_CONFIG_DIR||path.join(this.homeDir,'.claude'),'projects');let dirs=[];
    try{dirs=await fs.readdir(root,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return {threads:[],projects:[]};throw error;}
    const files=[];
    for(const dir of dirs){if(!dir.isDirectory())continue;const parent=path.join(root,dir.name);let names=[];try{names=await fs.readdir(parent);}catch{continue;}
      for(const name of names){const id=name.replace(/\.jsonl$/,'');if(!name.endsWith('.jsonl')||!UUID.test(id))continue;const file=path.join(parent,name);try{const stat=await fs.stat(file);if(stat.isFile())files.push({file,id,stat});}catch{}}
    }
    files.sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs);const threads=[];
    for(const {file,id,stat} of files.slice(0,500)){
      let cache=this.historyCache.get(file);if(!cache||cache.size!==stat.size||cache.mtime!==stat.mtimeMs){try{cache={size:stat.size,mtime:stat.mtimeMs,info:transcriptInfo(await readEdges(file,stat),id,stat.mtimeMs)};this.historyCache.set(file,cache);}catch{continue;}}
      if(cache.info)threads.push(cache.info);
    }
    const retained=new Set(files.slice(0,500).map(x=>x.file));for(const key of this.historyCache.keys())if(!retained.has(key))this.historyCache.delete(key);
    return {threads,projects:[...new Set(threads.map(t=>t.cwd))].map(p=>({path:p,name:path.basename(p)||p}))};
  }
  async hookSettings(id){
    const dir=path.join(this.dataDir,'claude-hooks',id);await fs.mkdir(dir,{recursive:true});
    const source=await fs.readFile(path.join(__dirname,'claude-hook.ps1'),'utf8');
    const command='powershell.exe -WindowStyle Hidden -NoLogo -NoProfile -NonInteractive -EncodedCommand '+encoded(`$ogleEventDir=${psLiteral(dir)}\n${source}`);
    const hooks={};for(const event of ['SessionStart','UserPromptSubmit','PermissionRequest','PostToolUse','PostToolUseFailure','Notification','Stop','StopFailure','SessionEnd'])hooks[event]=[{hooks:[{type:'command',command,timeout:3,...(event.startsWith('PostToolUse')?{async:true}:{})}]}];
    const settings=path.join(dir,'settings.json');await fs.writeFile(settings,JSON.stringify({hooks}));return {dir,settings};
  }
  create(input={}){
    const key=input.setup===true?'setup':input.resume;
    if(key&&this.pendingCreates.has(key))return this.pendingCreates.get(key);
    const promise=this._create(input);if(key){this.pendingCreates.set(key,promise);promise.finally(()=>this.pendingCreates.delete(key)).catch(()=>{});}return promise;
  }
  async _create(input={}){
    if(this.disposed)throw new Error('Claude terminal is closed.');
    const cwd=path.resolve(input.cwd||this.homeDir);if(!(await fs.stat(cwd)).isDirectory())throw new Error('Choose a project folder.');
    if(input.resume&&!UUID.test(input.resume))throw new Error('Invalid Claude session.');
    if(input.model&&(!/^[a-zA-Z0-9._:[\]-]+$/.test(input.model)||input.model.length>150))throw new Error('Invalid Claude model.');
    const executable=await discoverClaude(this);const setup=input.setup===true;
    if(!executable&&!setup)throw new Error('Install Claude Code using Setup, then open a project.');
    if(setup&&[...this.sessions.values()].some(s=>s.setup))throw new Error('Claude Code setup is already open.');
    if(input.resume){const existing=[...this.sessions.values()].find(s=>s.resume===input.resume);if(existing)return {id:existing.id,cwd:existing.cwd,resume:existing.resume,state:existing.state,setup:false};}
    const id=randomUUID(),cols=size(input.cols,80),rows=size(input.rows,24);let hook=null;
    const ps=path.join(this.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    let file=executable,args=[];
    if(setup){file=ps;args=['-NoLogo','-NoProfile','-NoExit','-EncodedCommand',encoded(INSTALL_COMMAND)];}
    else{
      hook=await this.hookSettings(id);args=['--settings',hook.settings];if(input.resume)args.push('--resume',input.resume);if(input.model)args.push('--model',input.model);
      if(/\.(cmd|bat)$/i.test(file)){const command='& '+[file,...args].map(psLiteral).join(' ');file=ps;args=['-NoLogo','-NoProfile','-EncodedCommand',encoded(command)];}
    }
    const env={...this.env,TERM:'xterm-256color'};for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];
    let child;try{if(this.disposed)throw new Error('Claude terminal is closed.');child=(this.pty||require('@lydell/node-pty')).spawn(file,args,{name:'xterm-256color',cwd,cols,rows,env});}catch(error){if(hook)await this.cleanup(hook.dir);throw error;}
    const session={id,cwd,resume:input.resume||null,state:'idle',setup,pty:child,hook};this.sessions.set(id,session);
    child.onData(data=>this.emit({type:'claude-terminal',id,event:'data',data}));
    child.onExit(event=>{if(this.sessions.get(id)!==session)return;this.sessions.delete(id);try{child.kill();}catch{}this.activity(session,'idle');this.emit({type:'claude-terminal',id,event:'exit',exitCode:event.exitCode});if(hook)this.cleanup(hook.dir);this.updatePoll();});
    this.updatePoll();return {id,cwd,resume:session.resume,state:session.state,setup};
  }
  activity(session,state){if(session.state===state)return;session.state=state;this.emit({type:'claude-activity',threadId:session.id,state});}
  updatePoll(){if(![...this.sessions.values()].some(s=>s.hook)){clearInterval(this.pollTimer);this.pollTimer=null;}else if(!this.pollTimer){this.pollTimer=setInterval(()=>this.poll().catch(()=>{}),this.pollMs);this.pollTimer.unref?.();}}
  async poll(){
    if(this.polling||this.disposed)return;this.polling=true;
    try{for(const session of this.sessions.values()){
      if(!session.hook)continue;let files=[];try{files=await fs.readdir(session.hook.dir);}catch{continue;}
      for(const name of files.filter(n=>/^\d+-[0-9a-f-]+\.event\.json$/i.test(n)).sort()){
        const file=path.join(session.hook.dir,name);let event;try{const stat=await fs.stat(file);if(stat.size>4096){await fs.unlink(file);continue;}event=JSON.parse(await fs.readFile(file,'utf8'));await fs.unlink(file);}catch{continue;}
        if(this.sessions.get(session.id)!==session)break;
        if(event.sessionId&&UUID.test(event.sessionId)&&!event.agentId&&(!session.resume||(event.event==='SessionStart'&&session.resume!==event.sessionId))){session.resume=event.sessionId;this.emit({type:'claude-terminal',id:session.id,event:'session',resume:session.resume});}
        // Per-tool notifications run in the background. A delayed notification
        // may clear a permission wait, but must not restart an already done pet.
        if(event.event?.startsWith('PostToolUse')&&session.state!=='waiting')continue;
        const state=activityFor(event);if(state)this.activity(session,state);
      }
    }}finally{this.polling=false;}
  }
  write(id,data){const session=this.sessions.get(id);if(!session)throw new Error('Claude terminal is closed.');if(typeof data!=='string'||data.length>1024*1024)throw new Error('Invalid terminal input.');session.pty.write(data);}
  resize(id,cols,rows){this.sessions.get(id)?.pty.resize(size(cols,80),size(rows,24));}
  async cleanup(dir){const base=path.resolve(this.dataDir,'claude-hooks');const target=path.resolve(dir);if(path.dirname(target)!==base||!UUID.test(path.basename(target)))return;await fs.rm(target,{recursive:true,force:true}).catch(()=>{});}
  close(id){const session=this.sessions.get(id);if(!session)return;this.sessions.delete(id);session.pty.kill();this.activity(session,'idle');this.emit({type:'claude-terminal',id,event:'exit',exitCode:null});if(session.hook)this.cleanup(session.hook.dir);this.updatePoll();}
  dispose(){for(const id of [...this.sessions.keys()])this.close(id);this.disposed=true;clearInterval(this.pollTimer);this.pollTimer=null;}
}
module.exports={ClaudeBridge,discoverClaude,activityFor,transcriptInfo,INSTALL_COMMAND};
