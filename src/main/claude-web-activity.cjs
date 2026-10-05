'use strict';
const {AdaptivePoll}=require('./adaptive-poll.cjs');
const {ActivityTracker}=require('./chatgpt-activity.cjs');
// UI signals only. This probe never reads transcript, draft or attachment text.
const CLAUDE_PROBE=`(()=>{
 if(location.origin!=='https://claude.ai'||document.readyState!=='complete')return{available:false};
 const visible=n=>!!(n&&n.getClientRects().length&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden');
 const composer=[...document.querySelectorAll('[contenteditable="true"][role="textbox"], [contenteditable="true"].ProseMirror, textarea')].find(visible);
 const buttons=[...document.querySelectorAll('button[aria-label],button[data-testid]')];
 const working=buttons.some(n=>visible(n)&&(/^(stop|stop response|stop generating|zaustavi)(\\s|$)/i.test(n.getAttribute('aria-label')||'')||/stop/i.test(n.getAttribute('data-testid')||'')));
 const composerReady=!!(composer&&!composer.disabled&&composer.getAttribute('aria-disabled')!=='true');
 let watch=window.__ogleClaudeWebActivity;
 if(!watch){watch={sent:false};const click=e=>{const b=e.target.closest?.('button');if(e.isTrusted&&b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&/^(send|send message|po\\u0161alji)(\\s|$)/i.test(b.getAttribute('aria-label')||''))watch.sent=true;};const submit=e=>{if(e.isTrusted&&e.target.querySelector?.('[contenteditable="true"],textarea'))watch.sent=true;};document.addEventListener('click',click,true);document.addEventListener('submit',submit,true);watch.dispose=()=>{document.removeEventListener('click',click,true);document.removeEventListener('submit',submit,true);};Object.defineProperty(window,'__ogleClaudeWebActivity',{value:watch,configurable:true});}
 const sent=watch.sent;watch.sent=false;return{available:true,working,composerReady,latestAssistant:true,complete:!working&&composerReady,failed:false,sent};
})()`;
class ClaudeWebActivity{
 constructor(contents,onActivity=()=>{},interval=700){this.contents=contents;this.tracker=new ActivityTracker(event=>{this.poller?.context({working:event.state==='working'});onActivity(event);});this.pending=false;this.disposed=false;this.sawStop=false;this.unconfirmedUntil=0;this.unconfirmedSubmission=false;this.epoch=0;this.lastUrl=contents.getURL();this.navigate=(_e,url,inPlace,main)=>{if(!main)return;const promotion=inPlace&&/\/new(?:[?#]|$)/.test(this.lastUrl)&&/\/chat\//.test(url);this.lastUrl=url;this.epoch++;if(!promotion){this.unconfirmedSubmission=false;this.sawStop=false;this.unconfirmedUntil=0;this.tracker.reset();}};this.loaded=()=>this.poll();this.failed=(_e,code,_d,_u,main)=>{if(main&&code!==-3){this.unconfirmedSubmission=false;this.tracker.fail();}};this.crashed=()=>{this.unconfirmedSubmission=false;this.tracker.fail();};contents.on('did-start-navigation',this.navigate);contents.on('did-finish-load',this.loaded);contents.on('did-fail-load',this.failed);contents.on('render-process-gone',this.crashed);this.poller=new AdaptivePoll(()=>this.poll(),{activeMs:Math.max(250,interval)});}
 setVisible(visible){this.poller.context({visible});}
 wake(){this.poller.wake();}
 async poll(){if(this.pending||this.disposed||this.contents.isDestroyed()||this.contents.isLoadingMainFrame())return false;try{if(new URL(this.contents.getURL()).origin!=='https://claude.ai')return false;}catch{return false;}const epoch=this.epoch;this.pending=true;try{const v=await this.contents.executeJavaScript(CLAUDE_PROBE);if(this.disposed||epoch!==this.epoch)return false;if(v.sent&&v.available&&!v.working){this.sawStop=false;this.unconfirmedSubmission=true;this.unconfirmedUntil=Date.now()+15000;this.tracker.sample({...v,working:true,complete:false});}if(v.working){this.unconfirmedSubmission=false;this.sawStop=true;this.unconfirmedUntil=0;}if(this.unconfirmedUntil&&Date.now()>=this.unconfirmedUntil){this.unconfirmedUntil=0;this.tracker.reset();return v?.available===true;}this.tracker.sample({...v,complete:v.complete===true&&this.sawStop});return v?.available===true;}catch{return false;}finally{this.pending=false;}}
 dispose(){this.disposed=true;this.poller.dispose();for(const [name,fn]of[['did-start-navigation',this.navigate],['did-finish-load',this.loaded],['did-fail-load',this.failed],['render-process-gone',this.crashed]])this.contents.removeListener(name,fn);this.tracker.reset();if(!this.contents.isDestroyed())this.contents.executeJavaScript('window.__ogleClaudeWebActivity?.dispose();delete window.__ogleClaudeWebActivity;true').catch(()=>{});}
}
module.exports={ClaudeWebActivity,CLAUDE_PROBE};
