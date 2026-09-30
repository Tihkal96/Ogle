'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CodexActivity } = require('../src/main/codex-activity.cjs');
const now = Date.now();
const event = (type, turn = 'turn1', timestamp = now) => JSON.stringify({ type: 'event_msg', timestamp: new Date(timestamp).toISOString(), payload: { type, turn_id: turn } }) + '\n';
async function setup(t, contents = '') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ogle-activity-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'task.jsonl'); await fs.writeFile(file, contents);
  const rows = [{ id: 'task', path: file }], events = [];
  const monitor = new CodexActivity({ list: async () => ({ data: rows }), now: () => now });
  monitor.on('activity', value => events.push(value)); t.after(() => monitor.stop());
  return { monitor, file, rows, events, dir };
}
test('unopened task append starts and finishes visual activity without historical completion', async t => {
  const { monitor, file, events } = await setup(t, event('task_started') + event('task_complete'));
  await monitor.tick(); assert.equal(events.length, 0);
  await fs.appendFile(file, event('task_started', 'new')); await monitor.tick();
  await fs.appendFile(file, event('task_complete', 'old')); await monitor.tick();
  assert.equal(events.length, 1);
  await fs.appendFile(file, event('task_complete', 'new')); await monitor.tick();
  assert.deepEqual(events.map(e => [e.running, e.completed]), [[true, undefined], [false, true]]);
  assert.ok(events.every(e => e.visualOnly));
});
test('startup discovers recent running item even when start lies beyond bounded tail', async t => {
  const { monitor, events } = await setup(t, event('task_started') + JSON.stringify({ ignored: 'x'.repeat(100000) }) + '\n' + event('item_completed'));
  await monitor.tick(); assert.equal(events.length, 1); assert.equal(events[0].baseline, true); assert.equal(events[0].running, true);
});
test('stale baseline and idle ticks do not replay activity', async t => {
  const { monitor, events } = await setup(t, event('task_started', 'old', now - 60000));
  await monitor.tick(); await monitor.tick(); assert.equal(events.length, 0);
});
test('partial appended records wait for newline and abort does not signal success', async t => {
  const { monitor, file, events } = await setup(t); await monitor.tick();
  const line = event('task_started'); await fs.appendFile(file, line.slice(0, 30)); await monitor.tick(); assert.equal(events.length, 0);
  await fs.appendFile(file, line.slice(30)); await monitor.tick();
  await fs.appendFile(file, event('turn_aborted')); await monitor.tick();
  assert.equal(events[1].completed, false);
});
test('new tasks discovered by metadata refresh without selecting them', async t => {
  const { monitor, rows, dir, events } = await setup(t); await monitor.tick();
  const file = path.join(dir, 'other.jsonl'); await fs.writeFile(file, event('task_started'));
  rows.unshift({ id: 'other', path: file }); monitor.nextRefresh = 0; await monitor.tick();
  assert.equal(events[0].threadId, 'other');
});
test('later catalog discovery announces recent running evidence that predates monitor startup', async t => {
  const { monitor, rows, dir, events } = await setup(t); await monitor.tick();
  const file = path.join(dir, 'existing.jsonl'); await fs.writeFile(file, event('item_completed', 'existing', now - 10000));
  rows.unshift({ id: 'existing', path: file }); monitor.nextRefresh = 0; await monitor.tick();
  assert.equal(events.length, 1); assert.equal(events[0].threadId, 'existing'); assert.equal(events[0].running, true);
  await fs.appendFile(file, event('item_completed', 'existing')); await monitor.tick();
  assert.equal(events.length, 1);
});
test('stop during async discovery cannot recreate watched files', async t => {
  const { monitor, rows } = await setup(t); let finish;
  monitor.list = () => new Promise(resolve => { finish = resolve; });
  const pending = monitor.tick(); monitor.stop(); finish({ data: rows }); await pending;
  assert.equal(monitor.files.size, 0);
});
test('new task that finishes between catalog refreshes is observed once', async t => {
  const { monitor, rows, dir, events } = await setup(t); await monitor.tick();
  const file = path.join(dir, 'quick.jsonl'); await fs.writeFile(file, event('task_started') + event('task_complete'));
  rows.unshift({ id: 'quick', path: file }); monitor.nextRefresh = 0; await monitor.tick(); await monitor.tick();
  assert.deepEqual(events.map(e => e.running), [true, false]);
});
test('duplicate session rows do not watch older rollout or let its completion override active task', async t => {
  const { monitor, rows, dir, events } = await setup(t, event('task_started'));
  const old = path.join(dir, 'older.jsonl'); await fs.writeFile(old, event('task_complete'));
  rows.push({ id: 'task', path: old }); await monitor.tick();
  await fs.appendFile(old, event('task_complete')); await monitor.tick();
  assert.equal(monitor.files.size, 1); assert.deepEqual(events.map(e => e.running), [true]);
});
const settle = () => new Promise(resolve => setImmediate(resolve));
test('quiet startup task uses authoritative runtime without waiting for a fresh log append', async t => {
  const { monitor, events } = await setup(t, event('task_started', 'quiet', now - 60000));
  const calls=[]; monitor.readRuntime=async id=>{calls.push(id);return {running:true,turnId:'quiet'};};
  await monitor.tick(); await settle();
  assert.equal(events.length,1);assert.equal(events[0].source,'desktop-baseline');assert.equal(events[0].running,true);
  await monitor.tick(); assert.equal(calls.length,1);
});
test('old unfinished historical turn is not working when runtime is idle or unknown', async t => {
  for(const runtime of [{running:false},null]){const {monitor,events}=await setup(t,event('task_started','abandoned',now-60000));monitor.readRuntime=async()=>runtime;await monitor.tick();await settle();assert.equal(events.length,0);}
});
test('late active runtime cannot override an appended completion', async t => {
  const {monitor,file,events}=await setup(t,event('task_started','quiet',now-60000));let finish;
  monitor.readRuntime=()=>new Promise(resolve=>finish=resolve);await monitor.tick();await settle();
  await fs.appendFile(file,event('task_complete','quiet'));await monitor.tick();finish({running:true,turnId:'quiet'});await settle();assert.equal(events.length,0);
});
test('stopping rejects in-flight baseline result',async t=>{
  const {monitor,events}=await setup(t,event('task_started','quiet',now-60000));let finish;monitor.readRuntime=()=>new Promise(resolve=>finish=resolve);await monitor.tick();await settle();monitor.stop();finish({running:true,turnId:'quiet'});await settle();assert.equal(events.length,0);
});
test('baseline probe queue eventually covers more than four candidates with two concurrent calls',async t=>{
  const {monitor,rows,dir}=await setup(t,event('task_started','quiet',now-60000));
  for(let i=0;i<5;i++){const file=path.join(dir,'quiet'+i+'.jsonl');await fs.writeFile(file,event('task_started','quiet'+i,now-60000));rows.push({id:'quiet'+i,path:file});}
  let concurrent=0,max=0,count=0;const finish=[];
  monitor.readRuntime=()=>{count++;concurrent++;max=Math.max(max,concurrent);return new Promise(resolve=>finish.push(()=>{concurrent--;resolve({running:false});}));};
  await monitor.tick();await settle();assert.equal(count,2);
  while(finish.length){finish.shift()();await settle();}
  assert.equal(count,6);assert.equal(max,2);
});
test('nonempty unknown bounded tail probes runtime when large tool record hides lifecycle',async t=>{
  const {monitor,events}=await setup(t,event('task_started','quiet',now-60000)+JSON.stringify({type:'response_item',payload:{output:'x'.repeat(100000)}})+'\n');let calls=0;
  monitor.readRuntime=async()=>{calls++;return {running:true,turnId:'quiet'};};await monitor.tick();await settle();assert.equal(calls,1);assert.equal(events[0].running,true);
});
test('clear terminal baseline and empty file do not request runtime probes',async t=>{
  for(const content of ['',event('task_started','old',now-60000)+event('turn_aborted','old',now-50000),event('task_complete','old',now-50000)]){const {monitor,events}=await setup(t,content);let calls=0;monitor.readRuntime=async()=>{calls++;return {running:true,turnId:'old'};};await monitor.tick();await settle();assert.equal(calls,0);assert.equal(events.length,0);}
});
