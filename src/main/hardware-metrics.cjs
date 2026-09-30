'use strict';
const {execFile}=require('node:child_process');
const path=require('node:path');
// Optional probes only. No service, download, elevation, or hardware driver is installed.
function createHardwareMetrics({run=execFile,platform=process.platform}={}){
 let active=new Set(),disposed=false;
 function execute(file,args){return new Promise(resolve=>{if(disposed)return resolve('');let child;child=run(file,args,{windowsHide:true,timeout:6500,maxBuffer:128*1024},(error,stdout)=>{active.delete(child);resolve(error?'':String(stdout||''));});active.add(child);});}
 async function sample(settings){const result={cpuTemp:null,gpu:null,gpuClock:null};if(platform!=='win32'||disposed)return result;
 const scripts=[];
 if(settings.statsCpuTemp||settings.statsGpuClock)scripts.push("foreach($ns in @('root/LibreHardwareMonitor','root/OpenHardwareMonitor')) { try { Get-CimInstance -Namespace $ns -ClassName Sensor -OperationTimeoutSec 2 -ErrorAction Stop | ForEach-Object { if ($_.SensorType -eq 'Temperature' -and $_.Name -match 'CPU Package|CPU Core|Core Average') { $r.cpuTemp=[double]$_.Value }; if ($_.SensorType -eq 'Clock' -and $_.Identifier -match 'gpu' -and $_.Name -match 'GPU Core') {$r.gpuClock=[double]$_.Value} } } catch {} }");
 if(settings.statsGpu)scripts.push("try { $groups=Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Filter \"Name LIKE '%engtype_3D%'\" -OperationTimeoutSec 2 -ErrorAction Stop | Group-Object {($_.Name -replace '^.*luid_', 'luid_') -replace '_eng_.*$', ''}; if($groups){ $r.gpu=[Math]::Min(100,($groups | ForEach-Object {($_.Group | Measure-Object UtilizationPercentage -Sum).Sum} | Measure-Object -Maximum).Maximum) } } catch {}");
 if(scripts.length){const command="$ErrorActionPreference='Stop';$r=@{cpuTemp=$null;gpu=$null;gpuClock=$null};"+scripts.join(';')+";$r|ConvertTo-Json -Compress";const output=await execute(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')]);try{const values=JSON.parse(output);for(const key of Object.keys(result))if(typeof values[key]==='number'&&Number.isFinite(values[key])&&values[key]>=0)result[key]=values[key];}catch{}}

 const fields=[];if(settings.statsGpu&&result.gpu===null)fields.push(['gpu','utilization.gpu']);if(settings.statsGpuClock&&result.gpuClock===null)fields.push(['gpuClock','clocks.current.graphics']);
 if(fields.length){const output=await execute('nvidia-smi.exe',['--query-gpu='+fields.map(x=>x[1]).join(','),'--format=csv,noheader,nounits']);for(const line of output.trim().split(/\r?\n/)){const parts=line.split(',').map(x=>x.trim());fields.forEach(([key],index)=>{if(/^\d+(\.\d+)?$/.test(parts[index]||''))result[key]=Math.max(result[key]||0,key==='gpu'?Math.min(100,Number(parts[index])):Number(parts[index]));});}}

 return result;
 }
 function dispose(){disposed=true;for(const child of active)try{child.kill();}catch{}active.clear();}
 return {sample,dispose};
}
module.exports={createHardwareMetrics};
