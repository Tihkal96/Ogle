'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts',`debug-profile-${Date.now()}`);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({compactChatTarget:'chatgpt',autoStart:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.PETDOCK_TEST_EXE?{executablePath:process.env.PETDOCK_TEST_EXE,args:[],env}:{args:[root],env});
 try {
 const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state.settings.compactChatTarget==='chatgpt');
 await page.evaluate(async()=>{await switchPanel('settings');clearError();setConnection('error','spawn codex.exe ENOENT');onEvent({type:'startup-error',message:'Internal startup failure'});});
 await page.evaluate(()=>onEvent({type:'codex',method:'turn/completed',params:{turn:{status:'failed',error:{message:'Background Codex failure'}}}}));
 assert.equal(await page.locator('#error').isHidden(),true);
 assert.equal(await page.locator('#status-dot').getAttribute('title'),'Codex not connected');
 assert.equal(await page.locator('#status-dot').getAttribute('class'),'');
 await page.evaluate(()=>error(new Error("Error invoking remote method 'dock:chatgptSend': Error: ChatGPT already has an unsent draft or attachment.")));
 assert.match(await page.locator('#error').innerText(),/already a draft/);
 assert.doesNotMatch(await page.locator('#error').innerText(),/dock:|remote method|Error:/);
 await page.getByRole('button',{name:'Dismiss message'}).click();
 await page.getByRole('button',{name:'Open debug log',exact:true}).click();
 assert.equal(await page.locator('#debug-log').isVisible(),true);
 assert.match(await page.locator('#debug-log textarea').inputValue(),/codex.exe ENOENT/);
 assert.match(await page.locator('#debug-log textarea').inputValue(),/dock:chatgptSend/);
 await page.evaluate(()=>{OgleDiagnostics.record('Bearer secret123 api_key=private123','Test');OgleDiagnostics.record('Bearer secret123 api_key=private123','Test');});
 const log=await page.locator('#debug-log textarea').inputValue();assert.doesNotMatch(log,/secret123|private123/);assert.match(log,/×2/);
 await page.screenshot({path:path.join(root,'artifacts/debug-log.png')});
 await page.getByRole('button',{name:'Clear log',exact:true}).click();assert.match(await page.locator('#debug-log textarea').inputValue(),/No diagnostic/);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#debug-log').isHidden(),true);
 console.log(JSON.stringify({quietDisconnected:true,friendlyErrors:true,technicalDetailsInDebug:true,redaction:true,deduplication:true,clear:true,escapeCloses:true}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
