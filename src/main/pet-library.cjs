'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
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
class PetLibrary {
  constructor(bundled,{destination=process.env.PETDOCK_PETS_DIR || path.join(process.env.CODEX_HOME || path.join(os.homedir(),'.codex'),'pets'),fetcher=fetch}={}) { Object.assign(this,{bundled,destination,fetcher}); }
  async list() {
    const result=new Map();
    for(const folder of [this.bundled,this.destination]) {
      let entries;try{entries=await fs.readdir(folder,{withFileTypes:true});}catch{continue;}
      for(const entry of entries.filter(e=>e.isDirectory()&&!e.name.startsWith('.')))try{
        const base=path.join(folder,entry.name),config=JSON.parse(await fs.readFile(path.join(base,'pet.json'),'utf8'));
        if(config.spriteVersionNumber!==2)continue;
        const sprite=path.resolve(base,config.spritesheetPath||'spritesheet.webp');
        if(!sprite.startsWith(path.resolve(base)+path.sep))continue;
        await fs.access(sprite);
        result.set(entry.name,{id:entry.name,name:config.displayName||entry.name,config,spriteUrl:pathToFileURL(sprite).href});
      }catch{}
    }
    return [...result.values()].sort((a,b)=>(b.id==='rinne-mini')-(a.id==='rinne-mini'));
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
