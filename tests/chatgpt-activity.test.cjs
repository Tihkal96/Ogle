'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {ACTIVITY_PROBE,ActivityTracker,ChatGPTActivity}=require('../src/main/chatgpt-activity.cjs');
const idle={available:true,working:false,complete:false,failed:false};
function fixture(){const events=[];return{events,tracker:new ActivityTracker(event=>events.push(event.state))};}
test('DOM probe recognizes composer stop and rejects previous assistant final controls',()=>{
  const vm=require('node:vm');let role='user',stopping=true;
  const visible={getClientRects:()=>[{}]};
  const actions={...visible};
  const turn={matches:()=>false,querySelector:()=>null,querySelectorAll:selector=>selector.includes('copy-turn')?[actions]:[]};
  const assistant={closest:()=>turn,matches:()=>false,querySelector:()=>null};
  const composer={...visible,getAttribute:()=> 'true',disabled:false};
  const context={location:{hostname:'chatgpt.com'},getComputedStyle:()=>({visibility:'visible',display:'block'}),document:{
    readyState:'complete',querySelector:selector=>selector.startsWith('form[')?null:selector==='#composer-submit-button'?null:composer,querySelectorAll:selector=>{
      if(selector.includes('[data-message-author-role="assistant"]'))return[assistant];
      if(selector.startsWith('[data-message-author-role],'))return[{getAttribute:()=>role}];
      return selector.includes('composer-stop-button')&&stopping?[visible]:[];
    }
  }};
  let result=vm.runInNewContext(ACTIVITY_PROBE,context);
  assert.equal(result.working,true);assert.equal(result.complete,false);
  role='assistant';stopping=false;result=vm.runInNewContext(ACTIVITY_PROBE,context);
  assert.equal(result.working,false);assert.equal(result.complete,true);assert.equal(result.composerReady,true);
});
test('baseline completed history emits nothing; observed work requires stable completion',()=>{const {tracker,events}=fixture();tracker.sample({...idle,complete:true});tracker.sample({...idle,working:true});tracker.sample({...idle,complete:true});assert.deepEqual(events,['working']);tracker.sample({...idle,complete:true});tracker.sample({...idle,complete:true});assert.deepEqual(events,['working','done']);});
test('stop disappearance without positive final controls never completes',()=>{const {tracker,events}=fixture();tracker.sample({...idle,working:true});tracker.sample(idle);tracker.sample(idle);assert.deepEqual(events,['working']);});
test('old assistant controls while stop button appears cannot fabricate completion',()=>{const {tracker,events}=fixture();tracker.sample({...idle,working:true,complete:true});tracker.sample({...idle,complete:true});tracker.sample({...idle,complete:true});assert.deepEqual(events,['working']);tracker.sample({...idle,working:true});tracker.sample({...idle,complete:true});tracker.sample({...idle,complete:true});assert.deepEqual(events,['working','done']);});
test('navigation and context loss never become completion',()=>{const {tracker,events}=fixture();tracker.sample({...idle,working:true});tracker.sample({available:false});tracker.reset();tracker.sample({...idle,complete:true});tracker.sample({...idle,complete:true});assert.deepEqual(events,['working','idle']);});
test('explicit error only fails an observed running generation once',()=>{const {tracker,events}=fixture();tracker.sample({...idle,failed:true});tracker.sample({...idle,working:true});tracker.sample({...idle,failed:true});tracker.sample({...idle,failed:true});assert.deepEqual(events,['working','failed']);});
test('persistent modern response controls complete after stable ready composer',()=>{
  const {tracker,events}=fixture();
  const modern={...idle,complete:true,latestAssistant:true,composerReady:true};
  tracker.sample({...modern,working:true});
  tracker.sample(modern); assert.deepEqual(events,['working']);
  tracker.sample(modern); tracker.sample(modern);
  assert.deepEqual(events,['working','done']);
});
test('old response controls and missing composer do not end observed generation',()=>{
  const {tracker,events}=fixture();
  tracker.sample({...idle,working:true,complete:true});
  for(const sample of [{latestAssistant:false,composerReady:true},{latestAssistant:true,composerReady:false}]) {
    tracker.sample({...idle,complete:true,...sample}); tracker.sample({...idle,complete:true,...sample});
  }
  assert.deepEqual(events,['working']);
});
test('new chat URL promotion preserves work but conversation switching clears it',()=>{
  class Contents extends EventEmitter {getURL(){return 'https://chatgpt.com/';}}
  const contents=new Contents(),events=[],observer=new ChatGPTActivity(contents,e=>events.push(e.state),60000);
  observer.tracker.sample({...idle,working:true});
  contents.emit('did-start-navigation',{},'https://chatgpt.com/c/new',true,true);
  assert.deepEqual(events,['working']);
  contents.emit('did-start-navigation',{},'https://chatgpt.com/c/other',true,true);
  assert.deepEqual(events,['working','idle']); observer.dispose();
});
test('poll is bounded and ignores stale result after navigation',async()=>{class Contents extends EventEmitter{isDestroyed(){return false;}isLoadingMainFrame(){return false;}getURL(){return'https://chatgpt.com/';}executeJavaScript(){this.calls=(this.calls||0)+1;return new Promise(resolve=>this.resolve=resolve);}}const contents=new Contents(),events=[],observer=new ChatGPTActivity(contents,e=>events.push(e.state),60000);const first=observer.poll(),second=observer.poll();assert.equal(first,second);assert.equal(contents.calls,1);contents.emit('did-start-navigation',{},'https://chatgpt.com/c/test',false,true);contents.resolve({...idle,working:true});await first;assert.deepEqual(events,[]);observer.dispose();assert.equal(contents.listenerCount('did-start-navigation'),0);});

test('localized generic submit detects square stop glyph and Croatian stop label without English text',()=>{
 const vm=require('node:vm');let label='Zaustavi generiranje',rects=[],busy=false;
 const visible={getClientRects:()=>[{}]};
 const submit={...visible,getAttribute:()=>label,querySelectorAll:()=>rects};
 const turn={matches:selector=>busy&&selector.includes('aria-busy'),querySelector:()=>null,querySelectorAll:()=>[]};
 const assistant={closest:()=>turn};
 const composer={...visible,getAttribute:()=> 'true'};
 const context={location:{hostname:'chatgpt.com'},getComputedStyle:()=>({visibility:'visible',display:'block'}),document:{readyState:'complete',querySelector:selector=>selector.startsWith('form[')?null:selector==='#composer-submit-button'?submit:composer,querySelectorAll:selector=>selector.includes('[data-message-author-role="assistant"]')?[assistant]:selector.startsWith('[data-message-author-role],')?[{getAttribute:()=> 'assistant'}]:[]}};
 const probe=()=>vm.runInNewContext(ACTIVITY_PROBE,context);
 assert.equal(probe().working,true,'Croatian generic submit stop label');
 label='Arr\u00eater la g\u00e9n\u00e9ration';assert.equal(probe().working,true,'French stop label');
 label='Po\u0161alji poruku';assert.equal(probe().working,false,'normal localized send is idle');
 rects=[{getAttribute:key=>({width:'10',height:'10',fill:'currentColor'})[key]}];assert.equal(probe().working,true,'language independent stop square');
 rects=[];busy=true;assert.equal(probe().working,true,'streaming status on outer response article');
});

test('buffered fast generation emits working then stable completion even when stop is gone at poll',async()=>{
 class Contents extends EventEmitter{isDestroyed(){return false;}isLoadingMainFrame(){return false;}getURL(){return'https://chatgpt.com/c/fast';}async executeJavaScript(){return {sawWorking:this.fast,sample:{...idle,complete:true,latestAssistant:true,composerReady:true}};}}
 const contents=new Contents(),events=[],observer=new ChatGPTActivity(contents,e=>events.push(e.state),60000);contents.fast=true;await observer.poll();contents.fast=false;await observer.poll();assert.deepEqual(events,['working','done']);observer.dispose();
});

test('October composer without legacy ids recognizes real localized labels',()=>{
 const vm=require('node:vm');let label='Zaustavi generiranje';
 const visible={getClientRects:()=>[{}]};
 const button={...visible,getAttribute:()=>label,querySelectorAll:()=>[]};
 const editor={...visible,getAttribute:()=> 'true'};
 const form={querySelectorAll:()=>[button],querySelector:()=>editor};
 const context={location:{hostname:'chatgpt.com'},getComputedStyle:()=>({visibility:'visible',display:'block'}),document:{readyState:'complete',querySelector:selector=>selector.startsWith('form[')?form:null,querySelectorAll:()=>[]}};
 for(label of ['Zaustavi generiranje','Arr\u00eater la g\u00e9n\u00e9ration'])assert.equal(vm.runInNewContext(ACTIVITY_PROBE,context).working,true,label);
 label='Po\u0161alji poruku';assert.equal(vm.runInNewContext(ACTIVITY_PROBE,context).working,false);assert.equal(vm.runInNewContext(ACTIVITY_PROBE,context).composerReady,true);
});

test('unconfirmed trusted submission never completes from prior response controls',async()=>{class Contents extends EventEmitter{isDestroyed(){return false;}isLoadingMainFrame(){return false;}getURL(){return'https://chatgpt.com/c/test';}async executeJavaScript(){return this.value;}}const contents=new Contents(),events=[],observer=new ChatGPTActivity(contents,e=>events.push(e.state),60000);try{contents.value={submitted:true,sawWorking:false,sample:{...idle,complete:true,latestAssistant:true,composerReady:true}};await observer.poll();contents.value={...contents.value,submitted:false};await observer.poll();await observer.poll();assert.deepEqual(events,['working']);assert.equal(observer.unconfirmedSubmission,true);observer.unconfirmedUntil=Date.now()-1;await observer.poll();assert.deepEqual(events,['working','idle']);assert.equal(observer.unconfirmedSubmission,true);}finally{observer.dispose();}});

test('first prompt URL promotion cannot discard a buffered fast response',async()=>{class Contents extends EventEmitter{isDestroyed(){return false;}isLoadingMainFrame(){return false;}getURL(){return'https://chatgpt.com/';}executeJavaScript(){return this.result?Promise.resolve(this.result):new Promise(resolve=>this.resolve=resolve);}}const contents=new Contents(),events=[],observer=new ChatGPTActivity(contents,e=>events.push(e.state),60000);try{const first=observer.poll();contents.emit('did-start-navigation',{},'https://chatgpt.com/c/new',true,true);const sample={...idle,complete:true,latestAssistant:true,composerReady:true};contents.resolve({sawWorking:true,sample});await first;assert.deepEqual(events,['working']);contents.result={sawWorking:false,sample};await observer.poll();assert.deepEqual(events,['working','done']);}finally{observer.dispose();}});

test('fresh browser activity polls report unavailable contexts and probe errors honestly',async()=>{const {ClaudeWebActivity}=require('../src/main/claude-web-activity.cjs');for(const[Constructor,url,gpt]of[[ChatGPTActivity,'https://chatgpt.com/',true],[ClaudeWebActivity,'https://claude.ai/new',false]]){class Contents extends EventEmitter{getURL(){return url;}isDestroyed(){return false;}isLoadingMainFrame(){return this.loading;}async executeJavaScript(){if(this.error)throw Error('fixture context loss');return gpt?{sample:this.value,sawWorking:false}:this.value;}}const c=new Contents(),observer=new Constructor(c,()=>{},60000);try{c.value={...idle,composerReady:true,latestAssistant:true};assert.equal(await observer.poll(),true);c.loading=true;assert.equal(await observer.poll(),false);c.loading=false;c.value={available:false};assert.equal(await observer.poll(),false);c.error=true;assert.equal(await observer.poll(),false);}finally{observer.dispose();}}});
