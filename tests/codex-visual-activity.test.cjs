const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){const source=fs.readFileSync(require('node:path').join(__dirname,'../src/renderer/app.js'),'utf8');const start=source.indexOf('const visualActivity='),end=source.indexOf('function acknowledgeCompletion',start);const context={state:{running:new Map()},reactions:[],updatePetState(){},queueReaction(kind,id){context.reactions.push([kind,id]);}};vm.createContext(context);vm.runInContext(source.slice(start,end)+';this.visualActivity=visualActivity;',context);return context;}
test('visual completion stops stale working animation without releasing queue runtime',()=>{const f=fixture();f.state.running.set('task','turn');f.receiveVisualActivity({threadId:'task',turnId:'turn',running:false,completed:true});assert.equal(f.visualCodexRunning(),false);assert.equal(f.state.running.get('task'),'turn');assert.equal(f.reactions.length,1);});
test('authoritative and rollout completion produces one reaction per turn',()=>{const f=fixture();f.completeTaskReaction('task','turn');f.receiveVisualActivity({threadId:'task',turnId:'turn',running:false,completed:true});assert.equal(f.reactions.length,1);});
test('late old completion cannot suppress newer activity',()=>{const f=fixture();f.receiveVisualActivity({threadId:'task',turnId:'new',running:true});f.receiveVisualActivity({threadId:'task',turnId:'old',running:false,completed:true});assert.equal(f.visualCodexRunning(),true);assert.equal(f.reactions.length,0);});
test('a newer authoritative turn overrides old completed visual state',()=>{const f=fixture();f.receiveVisualActivity({threadId:'task',turnId:'old',running:false,completed:true});f.state.running.set('task','new');assert.equal(f.visualCodexRunning(),true);});
test('abort does not show done, including a later duplicate completion',()=>{const f=fixture();f.receiveVisualActivity({threadId:'task',turnId:'turn',running:true});f.receiveVisualActivity({threadId:'task',turnId:'turn',running:false,completed:false});f.completeTaskReaction('task','turn','interrupted');assert.equal(f.reactions.length,0);assert.equal(f.visualCodexRunning(),false);});
test('inactive visual map is bounded while preserving active tasks',()=>{const f=fixture();f.receiveVisualActivity({threadId:'active',turnId:'turn',running:true});for(let i=0;i<400;i++)f.receiveVisualActivity({threadId:'task'+i,turnId:'turn'+i,running:false,completed:true});assert.equal(f.visualActivity.size,256);assert.equal(f.visualActivity.get('active').running,true);});
test('stale idle desktop snapshot preserves newer rollout activity and queues no done',()=>{const f=fixture();const source=fs.readFileSync(require('node:path').join(__dirname,'../src/renderer/app.js'),'utf8');f.codexQueue={runtime(){}};f.state.selected=null;vm.runInContext(source.slice(source.indexOf('function setRuntime('),source.indexOf('function desktopThread(')),f);f.receiveVisualActivity({threadId:'task',turnId:'fresh',running:true});f.state.running.set('task','old');f.setRuntime('task',{running:false},'completed',undefined);assert.equal(f.visualCodexRunning(),true);assert.equal(f.reactions.length,0);});
test('boot cache restores pre-subscription running observation without replaying done',()=>{const f=fixture();f.state.connected=true;f.restoreBootActivity([{threadId:'task',turnId:'turn',running:true,baseline:true}]);assert.equal(f.visualCodexRunning(),true);assert.equal(f.reactions.length,0);});
test('boot cache never overrides live completion or repeats its reaction',()=>{const f=fixture();f.state.connected=true;f.receiveVisualActivity({threadId:'task',turnId:'turn',running:false,completed:true});f.restoreBootActivity([{threadId:'task',turnId:'turn',running:true}]);assert.equal(f.visualCodexRunning(),false);assert.equal(f.reactions.length,1);});
test('boot activity stays empty while disconnected',()=>{const f=fixture();f.state.connected=false;f.restoreBootActivity([{threadId:'task',turnId:'turn',running:true}]);assert.equal(f.visualActivity.size,0);});

function realPetFixture(){
 const source=fs.readFileSync(require('node:path').join(__dirname,'../src/renderer/app.js'),'utf8');
 let now=100;
 const context={state:{running:new Map(),attention:new Set(),petState:'idle',animationGeneration:0,reactionUntil:0,connected:true},document:{querySelector:()=>null},window:{addEventListener(){}},performance:{now:()=>now}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('const completedTasks='),source.indexOf('function renderThreads()'))+';this.completedTasks=completedTasks;this.visualActivity=visualActivity;',context);
 context.tick=()=>{now+=100;context.updatePetState();};return context;
}
test('real pet priority starts working over persistent done without any click',()=>{
 const f=realPetFixture();f.receiveVisualActivity({threadId:'task',turnId:'old',running:false,completed:true});assert.equal(f.state.petState,'review');assert.equal(f.state.reactionUntil,Infinity);
 const generation=f.state.animationGeneration;
 f.receiveVisualActivity({threadId:'task',turnId:'new',running:true});assert.equal(f.state.petState,'running');assert.equal(f.state.animationGeneration,generation+1);
 for(let i=0;i<500;i++)f.tick();assert.equal(f.state.petState,'running');assert.equal(f.state.animationGeneration,generation+1,'working animation is not restarted per frame');
 f.receiveVisualActivity({threadId:'task',turnId:'new',running:false,completed:true});assert.equal(f.state.petState,'review');
});
test('real pet boot cache starts running without pointer, focus or task selection',()=>{
 const f=realPetFixture();f.restoreBootActivity([{threadId:'task',turnId:'turn',running:true,baseline:true}]);assert.equal(f.state.petState,'running');assert.equal(f.completedTasks.size,0);
});
test('real pet preserves done notification while another task works and reveals it after abort',()=>{
 const f=realPetFixture();f.receiveVisualActivity({threadId:'done',turnId:'old',running:false,completed:true});f.receiveVisualActivity({threadId:'active',turnId:'new',running:true});assert.equal(f.state.petState,'running');
 f.receiveVisualActivity({threadId:'active',turnId:'new',running:false,completed:false});assert.equal(f.state.petState,'review');assert.equal(f.completedTasks.size,1);
});
