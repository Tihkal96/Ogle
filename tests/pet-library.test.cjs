'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { zipSync, strToU8 } = require('fflate');
const { PetLibrary, sourceUrl, readPackage } = require('../src/main/pet-library.cjs');
const config = { id: 'test-pet', displayName: 'Test Pet', spriteVersionNumber: 2, spritesheetPath: 'spritesheet.webp' };
let spritePromise;
const sprite = () => spritePromise ||= fs.readFile(path.join(__dirname, '../assets/pets/rinnegan/spritesheet.webp'));
async function archive(manifest = config, extras = {}, prefix = '') { return zipSync({ [prefix + 'pet.json']: strToU8(JSON.stringify(manifest)), [prefix + 'spritesheet.webp']: await sprite(), ...extras }, { level: 0 }); }

test('pet source parsing accepts names and install text but never executes commands', () => {
  assert.equal(sourceUrl('$ npx --yes codex-pets add fox'), 'https://codex-pets.net/api/pets/fox/download');
  assert.equal(sourceUrl('https://example.com/pet.zip'), 'https://example.com/pet.zip');
  assert.throws(() => sourceUrl('npx codex-pets add fox; calc.exe'), /Commands are not executed/);
  assert.throws(() => sourceUrl('http://example.com/pet.zip'), /HTTPS/);
  assert.throws(() => sourceUrl('https://user:password@example.com/pet.zip'), /passwords/);
});

test('valid nested package is sanitized while executable files are discarded', async () => {
  const parsed = readPackage(await archive({ ...config, maliciousExtra: 'ignored' }, { 'pet/run.cmd': strToU8('do not run') }, 'pet/'));
  assert.deepEqual(parsed.config, { ...config, description: '' });
  assert.deepEqual(Buffer.from(parsed.sprite), await sprite());
  assert.equal(Object.hasOwn(parsed.config, 'maliciousExtra'), false);
});

test('package rejects traversal, multiple manifests, invalid version and sprite references', async () => {
  assert.throws(() => readPackage(zipSync({ '../pet.json': strToU8('{}') })), /Unsafe path/);
  assert.throws(() => readPackage(zipSync({ 'C:/pet.json': strToU8('{}') })), /Unsafe path/);
  assert.throws(() => readPackage(zipSync({ 'readme.txt': strToU8('no manifest') })), /exactly one/);
  const wrongVersion = await archive({ ...config, spriteVersionNumber: 1 }); assert.throws(() => readPackage(wrongVersion), /spriteVersionNumber 2/);
  const wrongSprite = await archive({ ...config, spritesheetPath: '../outside.webp' }); assert.throws(() => readPackage(wrongSprite), /beside pet.json/);
  const duplicate = await archive(config, { 'other/pet.json': strToU8(JSON.stringify(config)) }); assert.throws(() => readPackage(duplicate), /exactly one/);
});

test('invalid image dimensions and oversized downloads are rejected before installation', async () => {
  const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2s2sAAAAASUVORK5CYII=', 'base64');
  const invalidAtlas = zipSync({ 'pet.json': strToU8(JSON.stringify({ ...config, spritesheetPath: 'sprite.png' })), 'sprite.png': onePixelPng });
  assert.throws(() => readPackage(invalidAtlas), /8-column, 11-row/);
  assert.throws(() => readPackage(Buffer.alloc(25 * 1024 * 1024 + 1)), /25 MB/);
});

test('fake download installs only validated files and preserves an existing installation', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'petdock-library-test-'));
  const destination = path.join(temp, 'pets'), bundled = path.join(temp, 'bundled'), bytes = await archive(config, { 'launch.exe': strToU8('ignored') });
  const calls = [];
  const library = new PetLibrary(bundled, { destination, fetcher: async (url, options) => { calls.push({ url, signal: options.signal }); return new Response(bytes, { status: 200 }); } });
  try {
    const installed = await library.install('test-pet');
    assert.equal(installed.pet.id, 'test-pet'); assert.equal(calls.length, 1); assert.ok(calls[0].signal instanceof AbortSignal);
    assert.deepEqual((await fs.readdir(path.join(destination, 'test-pet'))).sort(), ['pet.json', 'spritesheet.webp']);
    const original = await fs.readFile(path.join(destination, 'test-pet/pet.json'));
    await assert.rejects(library.install('test-pet'), /already installed/);
    assert.deepEqual(await fs.readFile(path.join(destination, 'test-pet/pet.json')), original);
    assert.deepEqual(await fs.readFile(path.join(destination, 'test-pet/spritesheet.webp')), await sprite());
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test('download failure leaves destination untouched', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'petdock-library-test-'));
  const destination = path.join(temp, 'pets');
  const library = new PetLibrary(temp, { destination, fetcher: async () => new Response('missing', { status: 404 }) });
  try { await assert.rejects(library.install('missing'), /404/); await assert.rejects(fs.access(destination), /ENOENT/); } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
