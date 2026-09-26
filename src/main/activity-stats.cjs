'use strict';
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
function cpuTotals(cpus) {let idle=0,total=0;for(const cpu of cpus){idle+=cpu.times.idle;for(const value of Object.values(cpu.times))total+=value;}return {idle,total};}
function cpuPercent(before,after){const total=after.total-before.total;return total>0?Math.max(0,Math.min(100,100*(1-(after.idle-before.idle)/total))):0;}
function createActivityStats({onUpdate=()=>{},onError=()=>{},platform=process.platform,launch=spawn,system=os,intervalMs=2000}={}){
  const value={clicks:0,keys:0,cpu:0,ram:0,inputAvailable:false};let child=null,timer=null,previous=null,buffer='',settings={},disposed=false;
  const snapshot=()=>({...value});
  function emit(){onUpdate(snapshot());}
  function stopInput(){if(child){const old=child;child=null;old.stdin?.end();const timeout=setTimeout(()=>{try{old.kill();}catch{}},1500);timeout.unref();old.once('exit',()=>clearTimeout(timeout));}value.inputAvailable=false;}
  function startInput(){if(child||platform!=='win32'||disposed)return;const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const processChild=launch(exe,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(fs.readFileSync(path.join(__dirname,'activity-input.ps1'),'utf8'),'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});child=processChild;buffer='';let baseClicks=value.clicks,baseKeys=value.keys;
    processChild.stdout.on('data',chunk=>{if(child!==processChild)return;buffer+=chunk.toString();if(buffer.length>4096){buffer='';return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);const match=/^(\d+),(\d+)$/.exec(line);if(match){value.clicks=baseClicks+Number(match[1]);value.keys=baseKeys+Number(match[2]);value.inputAvailable=true;emit();}}});
    // Never collect diagnostics containing input data: this process emits only two integer totals.
    processChild.stderr.on('data',()=>{});processChild.on('error',error=>{if(child===processChild){child=null;value.inputAvailable=false;onError(error);emit();}});processChild.on('exit',code=>{if(child===processChild){child=null;value.inputAvailable=false;if(code)onError(new Error('Activity input counter stopped'));emit();}});
  }
  function sample(){if(settings.statsCpu){const next=cpuTotals(system.cpus());value.cpu=previous?cpuPercent(previous,next):0;previous=next;}if(settings.statsRam){const total=system.totalmem();value.ram=total?100*(1-system.freemem()/total):0;}emit();}
  function configure(next){const old=settings;settings={...next};if(settings.statsClicks||settings.statsKeys)startInput();else if(child)stopInput();const changed=Boolean(old.statsCpu)!==Boolean(settings.statsCpu)||Boolean(old.statsRam)!==Boolean(settings.statsRam);if(!changed)return;if(timer)clearInterval(timer);timer=null;previous=null;if(settings.statsCpu||settings.statsRam){sample();timer=setInterval(sample,intervalMs);timer.unref?.();}else emit();}
  function dispose(){disposed=true;if(timer)clearInterval(timer);timer=null;stopInput();}
  return {configure,snapshot,dispose};
}
module.exports={createActivityStats,cpuTotals,cpuPercent};


