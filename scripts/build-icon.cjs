'use strict';
const fs=require('node:fs'),path=require('node:path');
const {pngToIco}=require('../src/main/pet-icon.cjs');
const root=path.resolve(__dirname,'..');
fs.writeFileSync(path.join(root,'assets/petdock.ico'),pngToIco(fs.readFileSync(path.join(root,'assets/ogle.png'))));
console.log('Built Ogle application icon');
require('electron').app.quit();
