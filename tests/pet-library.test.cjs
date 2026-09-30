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
const sprite = () => spritePromise ||= fs.readFile(path.join(__dirname, '../assets/pets/lago-realistic/spritesheet.webp'));
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
  const library = new PetLibrary(bundled, { destination, codexSource:path.join(temp,'missing-profile','pets'), fetcher: async (url, options) => { calls.push({ url, signal: options.signal }); return new Response(bytes, { status: 200 }); } });
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
  const library = new PetLibrary(temp, { destination, codexSource:path.join(temp,'missing-profile','pets'), fetcher: async () => new Response('missing', { status: 404 }) });
  try { await assert.rejects(library.install('missing'), /404/); await assert.rejects(fs.access(destination), /ENOENT/); } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test('Codex refresh copies locally, updates changed sprites and preserves pets offline', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ogle-pet-sync-'));
  const codexSource = path.join(temp, 'codex'), destination = path.join(temp, 'local');
  const source = path.join(codexSource, config.id);
  const library = new PetLibrary(path.join(temp, 'bundled'), { destination, codexSource });
  try {
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, 'pet.json'), JSON.stringify(config));
    await fs.writeFile(path.join(source, config.spritesheetPath), await sprite());
    assert.deepEqual(await library.list(), [], 'list never reads directly from Codex');
    const first = await library.refresh();
    assert.equal(first.source, 'codex'); assert.equal(first.updated, 1);
    assert.ok(require('node:url').fileURLToPath(first.pets[0].spriteUrl).startsWith(destination));
    assert.equal((await library.refresh()).updated, 0);
    const replacementConfig=JSON.parse(await fs.readFile(path.join(__dirname,'../assets/pets/rinne-mini/pet.json'),'utf8'));
    const replacement = await fs.readFile(path.join(__dirname, '../assets/pets/rinne-mini', replacementConfig.spritesheetPath));
    await fs.writeFile(path.join(source, config.spritesheetPath), replacement);
    const second = await library.refresh();
    assert.equal(second.updated, 1); assert.notEqual(second.pets[0].spriteUrl, first.pets[0].spriteUrl);
    assert.deepEqual(await fs.readFile(require('node:url').fileURLToPath(first.pets[0].spriteUrl)), await sprite(), 'active atlas remains intact');
    await fs.writeFile(path.join(source, config.spritesheetPath), 'broken');
    assert.equal((await library.refresh()).updated, 0);
    assert.equal((await library.list())[0].spriteUrl, second.pets[0].spriteUrl);
    await fs.rename(codexSource, path.join(temp, 'disconnected'));
    const offline = await library.refresh(); assert.equal(offline.source, 'local');
    assert.equal(offline.pets[0].spriteUrl, second.pets[0].spriteUrl);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test('refresh rejects escaping sprites and still offers independently installed pets offline', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ogle-pet-offline-'));
  const codexSource = path.join(temp, 'codex'), source = path.join(codexSource, 'unsafe');
  const bytes = await archive();
  const library = new PetLibrary(path.join(temp, 'bundled'), { destination: path.join(temp, 'local'), codexSource, fetcher: async () => new Response(bytes) });
  try {
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, 'pet.json'), JSON.stringify({ ...config, spritesheetPath: '../outside.webp' }));
    await fs.writeFile(path.join(codexSource, 'outside.webp'), await sprite());
    assert.equal((await library.refresh()).pets.length, 0);
    assert.equal((await library.install('test-pet')).pet.id, config.id);
    assert.equal((await library.refresh()).pets[0].id, config.id);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});


test('install mirrors to available Codex profile without replacing existing pets, and tolerates failure', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ogle-pet-install-codex-'));
  const bytes = await archive();
  try {
    const codexHome=path.join(temp,'codex'); await fs.mkdir(codexHome);
    const codexSource=path.join(codexHome,'pets');
    const make = suffix => new PetLibrary(path.join(temp,'bundled'), {destination:path.join(temp,suffix),codexSource,fetcher:async()=>new Response(bytes)});
    assert.equal((await make('local1').install('test-pet')).codex.status,'installed');
    assert.deepEqual(await fs.readFile(path.join(codexSource,config.id,config.spritesheetPath)),await sprite());
    assert.equal((await make('local2').install('test-pet')).codex.status,'existing');
    await fs.writeFile(path.join(codexSource,config.id,'pet.json'),'preserve existing user file');
    const conflict=await make('local3').install('test-pet');
    assert.equal(conflict.codex.status,'skipped'); assert.equal(conflict.pet.id,config.id);
    assert.equal(await fs.readFile(path.join(codexSource,config.id,'pet.json'),'utf8'),'preserve existing user file');
    const blocked=path.join(temp,'blocked'); await fs.writeFile(blocked,'not a directory');
    const failed=new PetLibrary(temp,{destination:path.join(temp,'local4'),codexSource:blocked,fetcher:async()=>new Response(bytes)});
    const result=await failed.install('test-pet'); assert.equal(result.pet.id,config.id);assert.equal(result.codex.status,'failed');assert.match(result.codex.warning,/Installed in Ogle/);
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
});

test('creator credits survive download, Codex mirroring and local refresh', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ogle-pet-credits-'));
  try {
    const codexSource = path.join(temp, 'codex', 'pets');
    await fs.mkdir(codexSource, { recursive:true });
    const bytes = await archive({ ...config, author:'Example Artist', sourceUrl:'https://example.com/pet' });
    const library = new PetLibrary(path.join(temp,'bundled'), {destination:path.join(temp,'local'),codexSource,fetcher:async()=>new Response(bytes)});
    const result = await library.install('test-pet');
    assert.equal(result.pet.config.author,'Example Artist');
    assert.equal(result.pet.config.sourceUrl,'https://example.com/pet');
    const mirrored=JSON.parse(await fs.readFile(path.join(codexSource,'test-pet','pet.json'),'utf8'));
    assert.equal(mirrored.author,'Example Artist');
    await library.refresh();
    assert.equal((await library.list())[0].config.author,'Example Artist');
    const unsafe=readPackage(await archive({...config,author:{bad:true},sourceUrl:'javascript:alert(1)'}));
    assert.equal(unsafe.config.author,undefined);
    assert.equal(unsafe.config.sourceUrl,undefined);
    const known=readPackage(await archive({...config,id:'fern'}));
    assert.equal(known.config.author,'pixel');
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
});
