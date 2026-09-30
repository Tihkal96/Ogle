'use strict';
const os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {createHardwareMetrics}=require('./hardware-metrics.cjs');
function cpuTotals(cpus){let idle=0,total=0;for(const cpu of cpus){idle+=cpu.times.idle;for(const value of Object.values(cpu.times))total+=value;}return {idle,total};}
function cpuPercent(before,after){const total=after.total-before.total;return total>0?Math.max(0,Math.min(100,100*(1-(after.idle-before.idle)/total))):0;}
function localDate(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function createActivityStats({dataDir,onUpdate=()=>{},onError=()=>{},platform=process.platform,launch=spawn,system=os,now=()=>new Date(),intervalMs=2000,hardware=createHardwareMetrics({platform})}={}){
 const file=dataDir?path.join(dataDir,'activity-totals.json'):null;
 const value={clicks:0,keys:0,cpu:0,ram:0,cpuTemp:null,gpu:null,gpuClock:null,inputAvailable:false};let day=localDate(now()),child=null,timer=null,previous=null,settings={},disposed=false,dirty=false,persistTimer=null,hardwareTimer=null,hardwareBusy=false;
 if(file)try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.date===day)for(const key of ['clicks','keys'])if(Number.isSafeInteger(saved[key])&&saved[key]>=0)value[key]=saved[key];}catch(error){if(error.code!=='ENOENT')onError(new Error('Activity totals could not be loaded'));}
 function persist(){if(persistTimer)clearTimeout(persistTimer);persistTimer=null;if(!file||!dirty)return;try{fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(`${file}.tmp`,JSON.stringify({date:day,clicks:value.clicks,keys:value.keys}));fs.renameSync(`${file}.tmp`,file);dirty=false;}catch{onError(new Error('Activity totals could not be saved'));}}
 function changed(){dirty=true;if(file&&!persistTimer){persistTimer=setTimeout(persist,5000);persistTimer.unref();}}
 function rollover(){const next=localDate(now());if(next!==day){day=next;value.clicks=0;value.keys=0;changed();}}
 const snapshot=()=>{rollover();return {...value};};
 function emit(){onUpdate(snapshot());}
 function stopInput(){value.inputAvailable=false;if(!child)return Promise.resolve();const old=child;child=null;return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timeout);resolve();};const timeout=setTimeout(()=>{try{old.kill();}catch{}finish();},1500);old.once('exit',finish);old.stdin?.end();});}
 function startInput(){if(child||platform!=='win32'||disposed)return;const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const processChild=launch(exe,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(fs.readFileSync(path.join(__dirname,'activity-input.ps1'),'utf8'),'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});child=processChild;let buffer='',lastClicks=0,lastKeys=0;
  processChild.stdout.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>4096){buffer='';return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);const match=/^(\d+),(\d+)$/.exec(line);if(match){const clicks=Number(match[1]),keys=Number(match[2]);if(!Number.isSafeInteger(clicks)||!Number.isSafeInteger(keys))continue;rollover();const dc=Math.max(0,clicks-lastClicks),dk=Math.max(0,keys-lastKeys);value.clicks+=dc;value.keys+=dk;lastClicks=clicks;lastKeys=keys;if(dc||dk)changed();value.inputAvailable=Boolean(child);emit();}}});
  processChild.stderr.on('data',()=>{});processChild.on('error',error=>{if(child===processChild){child=null;value.inputAvailable=false;onError(error);emit();}});processChild.on('exit',code=>{if(child===processChild){child=null;value.inputAvailable=false;if(code)onError(new Error('Activity input counter stopped'));emit();}});
 }
 async function sampleHardware(){if(hardwareBusy||disposed)return;hardwareBusy=true;try{const result=await hardware.sample(settings);if(!disposed){Object.assign(value,result);emit();}}catch{}finally{hardwareBusy=false;}}
 function sample(){rollover();if(settings.statsCpu){const next=cpuTotals(system.cpus());value.cpu=previous?cpuPercent(previous,next):0;previous=next;}if(settings.statsRam){const total=system.totalmem();value.ram=total?100*(1-system.freemem()/total):0;}emit();}
 function configure(next){const old=settings;settings={...next};if(settings.statsClicks||settings.statsKeys)startInput();else if(child)void stopInput();const changed=Boolean(old.statsCpu)!==Boolean(settings.statsCpu)||Boolean(old.statsRam)!==Boolean(settings.statsRam);if(changed){if(timer)clearInterval(timer);timer=null;previous=null;if(settings.statsCpu||settings.statsRam){sample();timer=setInterval(sample,intervalMs);timer.unref?.();}else emit();}if(['statsCpuTemp','statsGpu','statsGpuClock'].some(k=>Boolean(old[k])!==Boolean(settings[k]))){if(hardwareTimer)clearInterval(hardwareTimer);hardwareTimer=null;if(settings.statsCpuTemp||settings.statsGpu||settings.statsGpuClock){void sampleHardware();hardwareTimer=setInterval(sampleHardware,15000);hardwareTimer.unref?.();}}}
 async function dispose(){disposed=true;if(timer)clearInterval(timer);if(hardwareTimer)clearInterval(hardwareTimer);hardware.dispose();await stopInput();rollover();persist();}
 return {configure,snapshot,dispose};
}
module.exports={createActivityStats,cpuTotals,cpuPercent,localDate};
