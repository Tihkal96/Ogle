'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { unzipSync } = require('fflate');
const { imageSize } = require('image-size');
const MAX_ARCHIVE = 25*1024*1024;
function sourceUrl(input) {
  if (typeof input !== 'string' || input.length > 12000) throw new Error('Enter a pet name, install command, or HTTPS ZIP URL');
  const text = input.trim().replace(/^\$\s*/, '');
  const command = text.match(/^(?:npx\s+(?:--yes\s+|-y\s+)?codex-pets\s+add\s+)?([a-z0-9][a-z0-9_-]{0,79})$/i);
  if(command) return `https://codex-pets.net/api/pets/${encodeURIComponent(command[1])}/download`;
  const match = text.match(/https:\/\/[^\s"'<>\]\)\\]+/);
  if (!match) throw new Error('Use a pet name, npx codex-pets add NAME, or an HTTPS download URL. Commands are not executed.');
  const url=new URL(match[0]);
  if(url.username||url.password)throw new Error('Pet URLs cannot contain passwords');
  return url.href;
}
function readPackage(bytes) {
  if(bytes.length>MAX_ARCHIVE)throw new Error('Pet ZIP exceeds 25 MB');
  let total=0, count=0;
  const files=unzipSync(bytes,{filter:file=>{
    const normalized=file.name.replace(/\\/g,'/');
    if(normalized.startsWith('/')||normalized.includes(':')||normalized.split('/').includes('..'))throw new Error('Unsafe path in pet ZIP');
    if(++count>512)throw new Error('Pet ZIP contains too many files');
    const keep=/(?:^|\/)pet\.json$|\.(?:png|webp)$/i.test(normalized);
    if(keep){total+=file.originalSize;if(file.originalSize>40*1024*1024||total>80*1024*1024)throw new Error('Pet ZIP expands beyond the allowed size');}
    return keep;
  }});
  const manifests=Object.keys(files).filter(name=>/(?:^|\/)pet\.json$/.test(name));
  if(manifests.length!==1)throw new Error('Choose a ZIP with exactly one pet.json');
  const manifestName=manifests[0];
  if(files[manifestName].length>65536)throw new Error('Pet manifest is too large');
  const config=JSON.parse(Buffer.from(files[manifestName]).toString('utf8'));
  if(config.spriteVersionNumber!==2)throw new Error('This dock supports spriteVersionNumber 2 pets');
  if(typeof config.id!=='string'||!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(config.id))throw new Error('Invalid pet ID');
  if(typeof config.spritesheetPath!=='string'||!/^[-a-zA-Z0-9_.]+\.(png|webp)$/i.test(config.spritesheetPath))throw new Error('Pet sprite must be a PNG or WebP file beside pet.json');
  const prefix=manifestName.slice(0,manifestName.lastIndexOf('/')+1),sprite=files[prefix+config.spritesheetPath];
  if(!sprite)throw new Error('Sprite sheet is missing from ZIP');
  const dimensions=imageSize(sprite);
  if(!['png','webp'].includes(dimensions.type)||dimensions.width>8192||dimensions.height>11264||dimensions.width%8||dimensions.height%11)throw new Error('Sprite sheet must use the v2 8-column, 11-row atlas');
  return {config:{id:config.id,displayName:String(config.displayName||config.id).slice(0,120),description:String(config.description||'').slice(0,1000),spriteVersionNumber:2,spritesheetPath:config.spritesheetPath},sprite};
}
const safeId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value);
async function localPackage(base, id) {
  if (!safeId(id)) throw new Error('Invalid pet folder');
  const realBase = await fs.realpath(base);
  const manifest = path.join(base, 'pet.json');
  if (path.dirname(await fs.realpath(manifest)) !== realBase) throw new Error('Pet manifest must be local');
  if ((await fs.stat(manifest)).size > 65536) throw new Error('Pet manifest is too large');
  const config = JSON.parse(await fs.readFile(manifest, 'utf8'));
  const name = config.spritesheetPath || 'spritesheet.webp';
  if (config.spriteVersionNumber !== 2 || !/^[-a-zA-Z0-9_.]+\.(png|webp)$/i.test(name)) throw new Error('Invalid pet sprite');
  const spritePath = path.join(base, name);
  if (path.dirname(await fs.realpath(spritePath)) !== realBase) throw new Error('Pet sprite must be local');
  if ((await fs.stat(spritePath)).size > 40 * 1024 * 1024) throw new Error('Pet sprite is too large');
  const sprite = await fs.readFile(spritePath), dimensions = imageSize(sprite);
  if (!['png', 'webp'].includes(dimensions.type) || !dimensions.width || !dimensions.height || dimensions.width > 8192 || dimensions.height > 11264 || dimensions.width % 8 || dimensions.height % 11) throw new Error('Invalid pet atlas');
  const hash = createHash('sha256').update(sprite).digest('hex');
  return { config: { id, displayName: String(config.displayName || id).slice(0,120), description: String(config.description || '').slice(0,1000), spriteVersionNumber: 2, spritesheetPath: name }, sprite, spritePath, hash };
}
class PetLibrary {
  constructor(bundled, {
    destination = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'PetDock', 'pets'),
    codexSource = process.env.PETDOCK_PETS_DIR || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'pets'),
    fetcher = fetch
  } = {}) { Object.assign(this, { bundled, destination, codexSource, fetcher }); }
  async list() {
    const result = new Map();
    for (const folder of [this.bundled, this.destination]) {
      let entries; try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries.filter(e => e.isDirectory() && safeId(e.name))) try {
        const pet = await localPackage(path.join(folder, entry.name), entry.name);
        const url = pathToFileURL(pet.spritePath); url.searchParams.set('v', pet.hash.slice(0,16));
        result.set(entry.name, { id: entry.name, name: pet.config.displayName, config: pet.config, spriteUrl: url.href });
      } catch { /* Incomplete or invalid packages must not break the rest of the library. */ }
    }
    return [...result.values()].sort((a,b) => (b.id === 'rinne-mini') - (a.id === 'rinne-mini'));
  }
  refresh() {
    // Startup and the Settings button can overlap; only one writer updates manifests.
    if (!this.refreshing) this.refreshing = this.sync().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async sync() {
    let entries;
    try { entries = await fs.readdir(this.codexSource, { withFileTypes: true }); }
    catch { return { pets: await this.list(), source: 'local', updated: 0 }; }
    let updated = 0;
    if (path.resolve(this.codexSource) !== path.resolve(this.destination)) {
      for (const entry of entries.filter(e => e.isDirectory() && safeId(e.name))) {
        let temporary;
        try {
          const pet = await localPackage(path.join(this.codexSource, entry.name), entry.name);
          const target = path.join(this.destination, entry.name);
          await fs.mkdir(target, { recursive: true });
          // Never follow a user-created junction outside the owned library.
          if (path.dirname(await fs.realpath(target)) !== await fs.realpath(this.destination)) continue;
          const spriteName = `sprite-${pet.hash.slice(0,24)}${path.extname(pet.config.spritesheetPath).toLowerCase()}`;
          const config = { ...pet.config, spritesheetPath: spriteName };
          const manifest = JSON.stringify(config, null, 2);
          let current; try { current = await localPackage(target, entry.name); } catch {}
          if (current?.hash === pet.hash && JSON.stringify(current.config) === JSON.stringify(config)) continue;
          // Immutable sprite first, atomic manifest last. Existing renderers retain a valid atlas.
          const spriteTarget = path.join(target, spriteName);
          try { await fs.writeFile(spriteTarget, pet.sprite, { flag: 'wx' }); }
          catch (error) { if (error.code !== 'EEXIST') throw error; if (!Buffer.from(await fs.readFile(spriteTarget)).equals(pet.sprite)) throw new Error('Cached sprite differs'); }
          temporary = path.join(target, `.pet-${randomUUID()}.json`);
          await fs.writeFile(temporary, manifest, { flag: 'wx' });
          await fs.rename(temporary, path.join(target, 'pet.json'));
          temporary = null; updated++;
        } catch { /* Preserve the last good local copy if a source is incomplete or locked. */ }
        finally { if (temporary) await fs.unlink(temporary).catch(() => {}); }
      }
    }
    return { pets: await this.list(), source: 'codex', updated };
  }
  async install(input) {
    const url=sourceUrl(input);
    const response=await this.fetcher(url,{signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error(`Pet download failed (${response.status})`);
    const chunks=[];let length=0;
    const reader=response.body.getReader();
    for(;;){const{value,done}=await reader.read();if(done)break;length+=value.length;if(length>MAX_ARCHIVE){await reader.cancel();throw new Error('Pet ZIP exceeds 25 MB');}chunks.push(value);}
    const {config,sprite}=readPackage(Buffer.concat(chunks));
    await fs.mkdir(this.destination,{recursive:true});
    const target=path.join(this.destination,config.id);
    try{await fs.mkdir(target);}catch(error){if(error.code==='EEXIST')throw new Error('That pet is already installed. Select it in Settings.');throw error;}
    try {
      await fs.writeFile(path.join(target,config.spritesheetPath),sprite,{flag:'wx'});
      await fs.writeFile(path.join(target,'pet.json'),JSON.stringify(config,null,2),{flag:'wx'});
    } catch(error) {
      // This directory was created exclusively above; no pre-existing pet is removed.
      if(path.dirname(path.resolve(target))===path.resolve(this.destination))await fs.rm(target,{recursive:true,force:true});
      throw error;
    }
    const pets=await this.list();return {pets,pet:pets.find(p=>p.id===config.id)};
  }
}
module.exports={PetLibrary,sourceUrl,readPackage};
