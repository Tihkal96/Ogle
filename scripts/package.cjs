'use strict';
require('./check-release-link.cjs');
const path = require('node:path');
const {spawnSync}=require('node:child_process');
// Keep regex anchors out of cmd.exe: an unquoted ^ is consumed by the shell,
// causing /dist to remove runtime dependencies' own dist folders too.
(async () => {
  const { packager } = await import('@electron/packager');
  const { statFile } = await import('@electron/asar');
  const root = path.resolve(__dirname, '..');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const iconBuild=spawnSync(require('electron'),[path.join(root,'scripts/build-icon.cjs')],{env,windowsHide:true,stdio:'inherit'});
  if(iconBuild.status!==0)throw new Error('Application icon build failed');
  const outputs = await packager({ dir: root, name: 'Ogle', platform: 'win32', arch: 'x64', out: path.join(root,'dist'), overwrite: true,
    icon:path.join(root,'assets/petdock.ico'),
    asar:{unpack:'**/*.{node,dll,exe}',unpackDir:'src/main'},
    extraResource:[path.join(root,'vendor/everything')],
    ignore: [/^\/(?:dist|tests|artifacts|scripts)(?:\/|$)/, /^\/vendor\/everything(?:\/|$)/] });
  for (const output of outputs) {
    const archive = path.join(output,'resources/app.asar');
    for (const entry of ['src/main/main.cjs','node_modules/image-size/dist/cjs/index.js','node_modules/fflate/lib/node.cjs']) statFile(archive,path.normalize(entry));
    for(const entry of ['conpty.node','conpty_console_list.node']) require('node:fs').accessSync(path.join(output,'resources/app.asar.unpacked/node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64',entry));
    for (const entry of ['Everything.exe','es.exe','LICENSE-Everything.txt','LICENSE-ES.txt']) require('node:fs').accessSync(path.join(output,'resources/everything',entry));
    for(const entry of ['persistence-worker','durable-file','workspace-backups','settings','global-shortcuts','persistence-client']) require('node:fs').accessSync(path.join(output,'resources/app.asar.unpacked/src/main',entry+'.cjs'));
    console.log(`Verified runtime files: ${output}`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
