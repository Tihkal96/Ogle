'use strict';
const {_electron}=require('playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=path.join(root,'artifacts','chatgpt-activity-profile-'+Date.now());
 fs.mkdirSync(profile,{recursive:true});
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({autoStart:false,autoExpand:false,autoCollapse:false,compactChatTarget:'chatgpt',statsClicks:false,statsKeys:false}));
 const env={...process.env,PETDOCK_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const executablePath=process.env.PETDOCK_TEST_EXE;
 const app=await _electron.launch({...(executablePath?{executablePath,args:[]}:{args:[root]}),env});
 try{
  const page=await app.firstWindow();
  await app.evaluate(({session})=>session.fromPartition('persist:petdock-chatgpt').protocol.handle('https',()=>new Response('<!doctype html><html><body><main><article data-testid="conversation-turn-0"><div data-message-author-role="assistant"></div></article></main><div id="prompt-textarea" contenteditable="true"> </div></body></html>',{headers:{'content-type':'text/html'}})));
  await page.waitForFunction(()=>typeof state!=='undefined'&&state.bootReady&&!DockLayoutTransition.busy,null,{timeout:15000});
  await page.evaluate(()=>{
   // The HTTPS fixture owns only ChatGPT. Unrelated real Codex work must not
   // override the pet assertion; no application connection/profile is changed.
   visualCodexRunning=()=>false;completeTaskReaction=()=>{};
   completedTasks.clear();state.attention?.clear();state.pendingReaction=null;state.reactionUntil=0;
   window.__activity=[];window.dock.onEvent(e=>{if(e.type==='chatgpt-activity')window.__activity.push(e.state);});
   updatePetState();
  });
  await page.locator('[data-panel="chatgpt"]').evaluate(el=>el.click());
  let id;for(let i=0;i<30;i++){id=await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL()==='https://chatgpt.com/')?.id);if(id)break;await page.waitForTimeout(100);}assert.ok(id);
  const run=script=>app.evaluate(async({webContents},{id,script})=>webContents.fromId(id).executeJavaScript(script),{id,script});
  const start=()=>run(`document.querySelector('article').innerHTML='<div data-message-author-role="assistant"></div><button data-testid="copy-turn-action-button">Copy</button><button data-testid="composer-stop-button">Stop</button>';true`);
  const finish=()=>run(`document.querySelector('[data-testid="composer-stop-button"]')?.remove();true`);
  await page.waitForTimeout(1000);assert.deepEqual(await page.evaluate(()=>window.__activity),[]);
  await start();await page.waitForFunction(()=>window.__activity.includes('working')&&state.petState==='running',null,{timeout:5000});
  assert.equal(await page.locator('#pet').getAttribute('data-state'),'running');
  await run(`history.pushState({},'', '/c/fixture-new');true`);
  await page.waitForTimeout(1100);
  assert.deepEqual(await page.evaluate(()=>window.__activity),['working'],'First conversation URL assignment preserves work');
  await page.locator('[data-panel="notes"]').evaluate(el=>el.click());
  await finish();await page.waitForFunction(()=>window.__activity.includes('done')&&state.petState==='review',null,{timeout:6000});
  let events=await page.evaluate(()=>window.__activity);assert.deepEqual(events,['working','done']);
  await page.waitForFunction(()=>state.petState==='idle',null,{timeout:7000});
  await start();await page.waitForFunction(()=>window.__activity.length>=3,null,{timeout:5000});
  await app.evaluate(async({webContents},id)=>webContents.fromId(id).loadURL('https://chatgpt.com/c/fixture-navigation'),id);
  await run(`document.querySelector('article').innerHTML='<div data-message-author-role="assistant"></div><button data-testid="copy-turn-action-button">Copy</button>';true`);
  await page.waitForTimeout(2400);
  events=await page.evaluate(()=>window.__activity);assert.deepEqual(events,['working','done','working','idle'],'Navigation must not count as completed generation');
  await start();await page.waitForFunction(()=>window.__activity.at(-1)==='working',null,{timeout:5000});
  await run(`document.querySelector('article').innerHTML='<div data-message-author-role="assistant"></div><div data-testid="turn-error">Fixture error</div>';true`);
  await page.waitForFunction(()=>window.__activity.at(-1)==='failed',null,{timeout:5000});
  // Localized markup without the legacy stop testid must drive the same pet.
  await run(`document.querySelector('article').innerHTML='<div data-message-author-role="assistant"></div><button data-testid="copy-turn-action-button">Kopiraj</button><button id="composer-submit-button" aria-label="Zaustavi generiranje"><svg><rect width="10" height="10" fill="currentColor"></rect></svg></button>';true`);
  await page.waitForFunction(()=>window.__activity.at(-1)==='working'&&state.petState==='running',null,{timeout:5000});
  await run(`document.querySelector('#composer-submit-button').outerHTML='<button id="composer-submit-button" aria-label="Po\u0161alji poruku"><svg><path d="M1 2 L3 4"></path></svg></button>';true`);
  await page.waitForFunction(()=>window.__activity.at(-1)==='done',null,{timeout:6000});
  const beforeFast=await page.evaluate(()=>window.__activity.length);
  await run(`new Promise(resolve=>{const button=document.querySelector('#composer-submit-button');button.setAttribute('aria-label','Zaustavi generiranje');setTimeout(()=>{button.setAttribute('aria-label','Po\u0161alji poruku');resolve(true);},50);})`);
  await page.waitForFunction(count=>window.__activity.length>=count+2&&window.__activity.at(-1)==='done',beforeFast,{timeout:6000});
  assert.deepEqual((await page.evaluate(()=>window.__activity)).slice(beforeFast),['working','done'],'50ms generation is retained between 900ms polls');
  // Structural snapshot from the signed-in October UI: no legacy message-role,
  // article, prompt id or action testids. Only sanitized attributes are retained.
  await run(`document.body.innerHTML='<main><section data-turn-key="fixture"><h4 data-conversation-role="assistant"></h4><button aria-label="Ocijeni odgovor"></button></section></main><form data-chatgpt-composer data-composer-placement="thread"><div class="ProseMirror" role="textbox" contenteditable="true"></div><button type="button" aria-label="Zaustavi generiranje"></button></form>';true`);
  await page.waitForFunction(()=>window.__activity.at(-1)==='working'&&state.petState==='running',null,{timeout:5000});
  await run(`document.querySelector('form button').setAttribute('aria-label','Po\u0161alji poruku');true`);
  await page.waitForFunction(()=>window.__activity.at(-1)==='done',null,{timeout:6000});
  const modernBefore=await page.evaluate(()=>window.__activity.length);
  await run(`document.querySelector('form').onsubmit=event=>event.preventDefault();document.querySelector('form button').disabled=true;true`);
  await run(`document.querySelector('form button').click();true`);
  await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>window.__activity.length),modernBefore,'disabled/scripted send does not fabricate activity');
  await run(`document.querySelector('form button').disabled=false;true`);
  const gptPage=app.context().pages().find(p=>p.url().startsWith('https://chatgpt.com/'));
  // The browser view is hidden while Notes is active; show it before a trusted click.
  await page.locator('[data-panel="chatgpt"]').evaluate(el=>el.click());
  await gptPage.locator('form button').click();
  await page.waitForFunction(count=>window.__activity.length>=count+2&&window.__activity.at(-1)==='done',modernBefore,{timeout:6000}).catch(async error=>{console.error({events:await page.evaluate(()=>window.__activity),modernBefore,probe:await run(require('../src/main/chatgpt-activity.cjs').ACTIVITY_PROBE)});throw error;});
  const modernProbe=await run(require('../src/main/chatgpt-activity.cjs').ACTIVITY_PROBE);
  assert.equal(modernProbe.composerReady,true);assert.equal(modernProbe.complete,true);

  // ChatGPT completion must be distinguishable while Codex is also working.
  await page.evaluate(()=>{visualCodexRunning=()=>true;updatePetState();});
  await run(`document.querySelector('form button').setAttribute('aria-label','Zaustavi generiranje');true`);
  await page.waitForFunction(()=>window.__activity.at(-1)==='working'&&document.getElementById('chatgpt').dataset.activity==='working',null,{timeout:5000});
  assert.match(await page.locator('#chatgpt-activity-status').innerText(),/Working/);
  await run(`document.querySelector('form button').setAttribute('aria-label','Po\u0161alji poruku');true`);
  await page.waitForFunction(()=>window.__activity.at(-1)==='done'&&state.petState==='review',null,{timeout:6000});
  assert.equal(await page.locator('#chatgpt').getAttribute('data-activity'),'done');
  assert.match(await page.locator('#pet').getAttribute('title'),/Codex/);
  await page.waitForFunction(()=>state.petState==='running',null,{timeout:7000});
  const probe=require('../src/main/chatgpt-activity.cjs').ACTIVITY_PROBE,result=await run(probe);
  assert.ok(Object.values(result).every(v=>typeof v==='boolean'));
  assert.deepEqual(Object.keys(result).sort(),['available','complete','composerReady','failed','latestAssistant','working']);
  const report={at:new Date().toISOString(),profile,packaged:!!executablePath,events:await page.evaluate(()=>window.__activity),fastGenerationBuffered:true,localizedGenericSubmit:true,liveOctoberStructure:true,overlappingProviderStates:true,retainedControls:true,newChatPromotion:true,petWorkingReviewIdle:true,hiddenViewCompletion:true,navigationDoesNotComplete:true,explicitFailure:true,probeOnlyBooleans:true,source:'Controlled local HTTPS fixture; no actual account or prompt.'};
  fs.writeFileSync(path.join(root,'artifacts/chatgpt-activity-runtime.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
