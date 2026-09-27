const fs=require('node:fs/promises'),path=require('node:path');
const {createFileSearch}=require('../src/main/file-search.cjs');
(async()=>{
 const base=path.resolve('artifacts/bundled-search-runtime-'+Date.now());
 await fs.mkdir(path.join(base,'files'),{recursive:true});
 const expected=path.join(base,'files','ogle-žuti-search-fixture.txt');
 await fs.writeFile(expected,'fixture');
 const expectedFolder=path.join(base,'files','ogle-žuti-search-folder');await fs.mkdir(expectedFolder,{recursive:true});
 const binaryDir=process.env.PETDOCK_TEST_EXE?path.join(path.dirname(process.env.PETDOCK_TEST_EXE),'resources/everything'):undefined;
 const search=createFileSearch({dataDir:base,roots:[path.join(base,'files')],includeFixedDrives:true,discoverDrives:async()=>[base],...(binaryDir?{binaryDir}:{})});
 try{
  let result;
  for(let i=0;i<5;i++){
   result=await search.search('ogle-žuti-search-fixture');
   if(result.results.includes(expected))break;
   await new Promise(r=>setTimeout(r,300));
  }
  require('node:assert/strict').ok(result.results.includes(expected),JSON.stringify(result));
  const defaultFolders=await search.search('ogle-žuti-search');require('node:assert/strict').ok(!defaultFolders.results.some(target=>path.resolve(target)===expectedFolder),'folders excluded by default');
  let folderResults;for(let i=0;i<10;i++){folderResults=await search.search('ogle-žuti-search',{includeFolders:true});if(folderResults.results.some(target=>path.resolve(target)===expectedFolder))break;await new Promise(r=>setTimeout(r,300));}
  require('node:assert/strict').ok(folderResults.results.some(target=>path.resolve(target)===expectedFolder),JSON.stringify({expectedFolder,folderResults}));
  const byPath=await search.search('bundled-search-runtime');
  require('node:assert/strict').ok(byPath.results.includes(expected),'path matches must find files too');
  console.log('Bundled portable search found Unicode file/path and folder-exclusion checks without installation or elevation.');
 }finally{await search.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
