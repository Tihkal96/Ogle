'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 class Node{
  constructor(fragment=false){this.children=[];this.listeners={};this.fragment=fragment;this.clientHeight=100;this.top=0;}
  get scrollHeight(){return this.children.length*50;}
  get scrollTop(){return this.top;}set scrollTop(value){this.top=Math.max(0,Math.min(value,this.scrollHeight-this.clientHeight));}
  addEventListener(name,fn){this.listeners[name]=fn;}append(...nodes){for(const node of nodes)this.children.push(...(node.fragment?node.children:[node]));}
  replaceChildren(){this.children=[];this.top=0;}querySelector(){return null;}get lastChild(){return this.children.at(-1);}
 }
 const scope={window:{},performance:{now:()=>0},setTimeout:()=>1,clearTimeout:()=>{},document:{createDocumentFragment:()=>new Node(true),createElement:()=>new Node()}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/codex-messages.js'),'utf8'),scope);
 const node=new Node(),view=new scope.window.OgleMessages(node,new Map(),()=>true);
 const load=()=>{for(let i=0;i<100;i++)view.set('m'+i,'assistant','Message '+i);};
 const finish=()=>{while(view.pending.size)view.flush();};return {node,view,load,finish};
}
test('first conversation open follows the bottom through every history batch',()=>{
 const {node,view,load,finish}=fixture();view.select('a');load();finish();assert.equal(node.scrollTop,4900);
});
test('returning to a conversation restores its own scroll after clamped early batches',()=>{
 const {node,view,load,finish}=fixture();view.select('a');load();finish();node.scrollTop=3500;node.listeners.scroll();
 view.select('b');load();finish();assert.equal(node.scrollTop,4900);
 view.select('a');load();view.flush();assert.equal(node.scrollTop,1900);finish();assert.equal(node.scrollTop,3500);
});
test('scrolling during history load cancels forced following; new stream keeps that position',()=>{
 const {node,view,load,finish}=fixture();view.select('a');load();view.flush();node.listeners.wheel();node.scrollTop=500;node.listeners.scroll();finish();assert.equal(node.scrollTop,500);
 view.set('new','assistant','More');finish();assert.equal(node.scrollTop,500);view.toBottom();assert.equal(node.scrollTop,4950);
});
