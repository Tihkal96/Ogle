'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { resolveCodexExecutable } = require('../src/main/codex-executable.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ogle-codex-discovery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const put = async relative => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'fixture only, never executed'); return file; };
  return { root, put };
}
const noStore = async () => [];
test('explicit path precedes PATH, invalid override fails without fallback', async t => {
  const { root, put } = await fixture(t);
  const explicit = await put('explicit/codex.exe'); await put('path/codex.exe');
  const env = { Path: path.join(root, 'path'), PETDOCK_CODEX_PATH: explicit };
  assert.equal(await resolveCodexExecutable({ env, queryStore: noStore }), explicit);
  env.PETDOCK_CODEX_PATH = path.join(root, 'missing.exe');
  await assert.rejects(resolveCodexExecutable({ env, queryStore: noStore }), /PETDOCK_CODEX_PATH/);
});
test('PATH lookup skips missing entries and resolves executable', async t => {
  const { root, put } = await fixture(t); const exe = await put('bin/codex.exe');
  assert.equal(await resolveCodexExecutable({ env: { Path: `${root}/missing;"${path.dirname(exe)}"` }, queryStore: noStore }), exe);
});
test('local version discovery selects latest executable and rechecks after install', async t => {
  const { root, put } = await fixture(t); const env = { LOCALAPPDATA: root };
  await assert.rejects(resolveCodexExecutable({ env, queryStore: noStore }), { code: 'CODEX_NOT_INSTALLED' });
  const old = await put('OpenAI/Codex/bin/old/codex.exe'); await fs.utimes(old, 1, 1);
  const latest = await put('OpenAI/Codex/bin/new/codex.exe');
  assert.equal(await resolveCodexExecutable({ env, queryStore: noStore }), latest);
});
test('Store package resource is used without executing Codex', async t => {
  const { root, put } = await fixture(t); const exe = await put('store/app/resources/codex.exe');
  assert.equal(await resolveCodexExecutable({ env: {}, queryStore: async () => [path.join(root, 'store')] }), exe);
});
test('npm native package is discovered and missing installs are actionable', async t => {
  const { root, put } = await fixture(t);
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const exe = await put(`npm/node_modules/@openai/codex/vendor/${arch}-pc-windows-msvc/codex/codex.exe`);
  assert.equal(await resolveCodexExecutable({ env: { APPDATA: root }, queryStore: noStore }), exe);
  await assert.rejects(resolveCodexExecutable({ env: {}, queryStore: async () => { throw new Error('unavailable'); } }), /Install and open the Codex Windows app/);
});
