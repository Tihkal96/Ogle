'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 const nodes=[];
 const document={body:{append(){}},createElement(tag){const node={tag,append(){},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}};nodes.push(node);return node;}};
 const window={addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/diagnostics.js'),'utf8'),{window,document});
 return {api:window.OgleDiagnostics,log(){window.OgleDiagnostics.open();return nodes.find(node=>node.tag==='textarea').value;}};
}
test('file errors provide actionable messages without leaking technical details',()=>{
 const {api}=fixture();
 const cases=[
  ['This file is not valid UTF-8. Convert its encoding before opening it in Ogle.',/UTF-8/],
  ['This appears to be a binary or UTF-16 file. Open a UTF-8 text file.',/UTF-8/],
  ['Open a text file smaller than 5 MB',/5 MB/],
  ['The editor supports text files up to 5 MB',/5 MB/],
  ['File changed on disk while saving',/Save As/],
  ['This file may have changed outside the editor.',/Save As/],
  ["EACCES: permission denied, open 'C:\\Private\\secret.txt'",/permission/i],
  ["EPERM: operation not permitted, open 'C:\\Private\\secret.txt'",/permission/i],
  ["ENOENT: no such file or directory, open 'C:\\Private\\secret.txt'",/no longer|not found/i]
 ];
 for(const [message,expected]of cases){
  const result=api.friendly({message:`Error invoking remote method 'dock:editorOpen': Error: ${message}`,stack:'sensitive-stack'});
  assert.match(result,expected);assert.doesNotMatch(result,/dock:|Error:|Private|secret|sensitive-stack|EACCES|ENOENT|EPERM/);
 }
 assert.match(api.friendly(new Error('Unexpected error at C:\\Private\\secret.txt')),/Debug/);
});
test('existing chat guidance is preserved',()=>{
 const {api}=fixture();
 assert.match(api.friendly(new Error('ChatGPT already has an unsent draft')),/already a draft/);
 assert.match(api.friendly(new Error('ChatGPT did not confirm sending')),/may have been sent/);
 assert.match(api.friendly(new Error('thread already has an active writer')),/still in progress/);
 assert.match(api.friendly(new Error('spawn codex.exe ENOENT')),/Codex isn’t available/);
 assert.match(api.friendly(new Error('ChatGPT login is missing')),/sign-in/);
});
test('debug log redacts quoted JSON credentials and retains diagnostic context',()=>{
 const {api,log}=fixture();
 const secrets=['access secret','refresh-secret','p,a;ss word','key-secret','bare-secret','bearer-secret'];
 api.record(new Error('Failure: '+JSON.stringify({access_token:secrets[0],refresh_token:secrets[1],password:secrets[2],api_key:secrets[3]})+' api-key='+secrets[4]+' Bearer '+secrets[5]),'Editor');
 const output=log();
 for(const secret of secrets)assert.ok(!output.includes(secret),`Redacted ${secret}`);
 assert.match(output,/Editor/);assert.match(output,/Failure/);assert.match(output,/\[redacted\]/);
});
test('redaction consumes complete escaped and single-quoted credential values',()=>{
 const {api,log}=fixture();
 api.record('{"password":"escaped-prefix\\"escaped-suffix","safe":"keep this"} api_key=\'single-prefix, single-suffix\'');
 const output=log();
 assert.doesNotMatch(output,/escaped-prefix|escaped-suffix|single-prefix|single-suffix/);
 assert.match(output,/keep this/);
});
