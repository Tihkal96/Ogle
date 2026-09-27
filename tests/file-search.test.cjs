'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createFileSearch,parseResults,configuration}=require('../src/main/file-search.cjs');
function fixture(run){
 let launches=0;const writes=[];
 const search=createFileSearch({dataDir:'C:\\Fixture',roots:['C:\\Users\\Example\\Documents'],binaryDir:'C:\\Binaries',
 io:{stat:async()=>({isDirectory:()=>true}),mkdir:async()=>{},writeFile:async(...args)=>writes.push(args)},
 launch:(file,args,options)=>{launches++;assert.equal(options.windowsHide,true);assert.ok(args.includes('-startup'));assert.ok(!args.includes('-admin'));const child=new EventEmitter();child.unref=()=>{};process.nextTick(()=>child.emit('spawn'));return child;},run});
 return {search,writes,launches:()=>launches};
}
test('bundled index starts lazily and isolates its instance',async()=>{
 let call;const f=fixture((...args)=>{call=args;args[3](null,'C:\\Notes\\test.txt\r\n');});
 assert.equal(f.launches(),0);const result=await f.search.search('-example');
 assert.equal(f.launches(),1);assert.equal(result.status,'ok');assert.deepEqual(result.results,['C:\\Notes\\test.txt']);
 assert.equal(call[0],'C:\\Binaries\\es.exe');assert.deepEqual(call[1].slice(-2),['--','-example']);
 assert.match(call[1][1],/^Ogle-[a-f0-9]{16}$/);assert.equal(call[2].shell,false);assert.equal(call[2].windowsHide,true);assert.equal(call[2].timeout,5000);
 await f.search.search('again');assert.equal(f.launches(),1);await f.search.dispose();assert.ok(call[1].includes('-exit'));
});
test('configuration escapes folder paths and disables elevated/raw drive indexing',()=>{
 const config=configuration(['C:\\My Files','D:\\Files, extra']);
 assert.ok(config.includes('folders="C:\\\\My Files","D:\\\\Files, extra"'));
 assert.match(config,/run_as_admin=0/);assert.match(config,/auto_include_fixed_volumes=0/);assert.match(config,/folder_update_thread_mode_background=1/);
});
test('result parsing drops nonpaths, deduplicates and caps at 100',()=>{
 assert.equal(parseResults(Array.from({length:150},(_,i)=>`C:\\Files\\file${i}.txt`).join('\r\n')).length,100);
 assert.deepEqual(parseResults('C:\\a.txt\r\nC:\\A.txt\r\nhttps://example.com\r\nrelative.txt\r\n'),['C:\\a.txt']);
});
test('invalid searches never start indexing',async()=>{
 const f=fixture(()=>assert.fail('no process'));
 for(const value of ['',null,'a\n-b','a'.repeat(1025)])await assert.rejects(f.search.search(value),/Enter a file search/);
 assert.equal(f.launches(),0);
});
test('database startup timeout remains initializing rather than a false empty result',async()=>{
 const f=fixture((file,args,options,callback)=>callback(Object.assign(new Error('database loading'),{code:8})));
 const result=await f.search.search('pending');
 assert.equal(result.status,'initializing');assert.deepEqual(result.results,[]);
});
test('concurrent queries stay bounded and failures release the query slot',async()=>{
 let finish;const f=fixture((file,args,options,callback)=>{finish=callback;});
 const first=f.search.search('first');await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await f.search.search('second')).status,'busy');finish(new Error('unavailable'));assert.equal((await first).status,'unavailable');
 const retry=f.search.search('third');await new Promise(resolve=>setImmediate(resolve));finish(null,'');assert.equal((await retry).status,'ok');
});

test('local-drive search includes files outside personal folders without double indexing',async()=>{
 const writes=[];let args;
 const search=createFileSearch({dataDir:'C:\\Fixture',roots:['C:\\Users\\Example\\Documents','D:\\Shared'],includeFixedDrives:true,discoverDrives:async()=>['C:\\'],
 io:{stat:async()=>({isDirectory:()=>true}),mkdir:async()=>{},writeFile:async(...values)=>writes.push(values)},
 launch:()=>{const child=new EventEmitter();child.unref=()=>{};process.nextTick(()=>child.emit('spawn'));return child;},
 run:(file,values,options,callback)=>{args=values;callback(null,'C:\\Projects\\example.txt');}});
 const result=await search.search('Projects');
 assert.deepEqual(result.results,['C:\\Projects\\example.txt']);
 assert.match(result.scope,/Local drives/);assert.ok(args.includes('-p'));
 const config=writes[0][1];assert.ok(config.includes('folders="C:\\\\","D:\\\\Shared"'));
 assert.ok(!config.includes('Example'));assert.match(config,/max_threads=1/);
 await search.dispose();
});

test('folder results are excluded by default and included only explicitly',async()=>{let args;const f=fixture((file,a,options,callback)=>{args=a;callback(null,'');});await f.search.search('report');assert.ok(args.includes('/a-d'));await f.search.search('report',{includeFolders:true});assert.ok(!args.includes('/a-d'));await assert.rejects(f.search.search('report',{includeFolders:'yes'}),/Invalid search options/);await f.search.dispose();});
