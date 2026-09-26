'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),{version}=require(path.join(root,'package.json'));
const expected=`[Ogle ${version}](https://github.com/Tihkal96/Ogle/releases/download/v${version}/Ogle-${version}-win32-x64.zip)`;
if(!fs.readFileSync(path.join(root,'README.md'),'utf8').includes(expected))throw new Error(`Update the README direct download link for this release: ${expected}`);
