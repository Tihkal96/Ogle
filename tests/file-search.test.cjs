'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFileSearch, candidates, parseResults } = require('../src/main/file-search.cjs');
const env = { PETDOCK_EVERYTHING_CLI: 'C:\\Tools\\es.exe' };
const stat = async () => ({ isFile: () => true });

test('file search does no startup work and gives setup guidance without running a command', async () => {
  let calls = 0;
  const search = createFileSearch({ env, stat: async () => { calls++; throw new Error('missing'); }, run: () => assert.fail('must not execute') });
  assert.equal(calls, 0);
  const result = await search.search('notes');
  assert.equal(result.status, 'setup'); assert.equal(calls, 1);
  assert.match(result.message, /Everything/);
});

test('explicit searches use a bounded hidden process and cannot inject ES options or shell commands', async () => {
  const query = '-reindex & calc.exe';
  let call;
  const search = createFileSearch({ env, stat, run: (...args) => { call = args; args[3](null, 'C:\\Notes\\žuti.txt\r\n'); } });
  const result = await search.search(query);
  assert.equal(call[0], env.PETDOCK_EVERYTHING_CLI);
  assert.deepEqual(call[1].slice(-2), ['--', query]);
  assert.equal(call[1][call[1].indexOf('-n') + 1], '100');
  assert.equal(call[2].shell, false); assert.equal(call[2].windowsHide, true);
  assert.equal(call[2].timeout, 4000); assert.equal(call[2].maxBuffer, 1024 * 1024);
  assert.deepEqual(result.results, ['C:\\Notes\\žuti.txt']);
});

test('result parsing preserves Unicode, drops nonpaths, deduplicates and caps at 100', () => {
  const entries = Array.from({ length: 150 }, (_, i) => `C:\\Files\\file${i}.txt`);
  assert.equal(parseResults(entries.join('\r\n')).length, 100);
  assert.deepEqual(parseResults('\uFEFFC:\\žuti.txt\r\nC:\\ŽUTI.txt\r\nhttps://example.com\r\nrelative.txt\r\n\\\\server\\share\\file.txt\r\n'), ['C:\\žuti.txt', '\\\\server\\share\\file.txt']);
});

test('discovery considers explicit path, absolute PATH entries and standard install directories only', () => {
  assert.deepEqual(candidates({ ...env, PATH: 'relative;"C:\\Tools";;D:\\Bin', ProgramFiles: 'C:\\Program Files' }), ['C:\\Tools\\es.exe', 'D:\\Bin\\es.exe', 'C:\\Program Files\\Everything\\es.exe']);
});

test('invalid input never probes filesystem or launches a process', async () => {
  const search = createFileSearch({ stat: () => assert.fail('no discovery'), run: () => assert.fail('no process') });
  for (const query of ['', '   ', null, 'a\n-b', 'a'.repeat(1025)]) await assert.rejects(search.search(query), /Enter a file search/);
});

test('concurrent requests are bounded and a failed request releases the slot', async () => {
  let finish;
  const search = createFileSearch({ env, stat, run: (file, args, options, callback) => { finish = callback; } });
  const first = search.search('first');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await search.search('second')).status, 'busy');
  finish(Object.assign(new Error('IPC unavailable'), { code: 8 }));
  assert.equal((await first).status, 'unavailable');
  const retry = search.search('third');
  await new Promise(resolve => setImmediate(resolve)); finish(null, '');
  assert.equal((await retry).status, 'ok');
});
