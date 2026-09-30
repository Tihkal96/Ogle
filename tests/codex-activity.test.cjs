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
