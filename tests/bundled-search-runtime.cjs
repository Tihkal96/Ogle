const fs=require('node:fs/promises'),path=require('node:path');
const {createFileSearch}=require('../src/main/file-search.cjs');
(async()=>{
 const base=path.resolve('artifacts/bundled-search-runtime');
 await fs.mkdir(path.join(base,'files'),{recursive:true});
 const expected=path.join(base,'files','ogle-žuti-search-fixture.txt');
 await fs.writeFile(expected,'fixture');
 const binaryDir=process.env.PETDOCK_TEST_EXE?path.join(path.dirname(process.env.PETDOCK_TEST_EXE),'resources/everything'):undefined;
 const search=createFileSearch({dataDir:base,roots:[path.join(base,'files')],...(binaryDir?{binaryDir}:{})});
 try{
  let result;
  for(let i=0;i<5;i++){
   result=await search.search('ogle-žuti-search-fixture');
   if(result.results.includes(expected))break;
   await new Promise(r=>setTimeout(r,300));
  }
  require('node:assert/strict').ok(result.results.includes(expected),JSON.stringify(result));
  console.log('Bundled portable search found Unicode fixture without installation or elevation.');
 }finally{await search.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
