'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 class Node{
  constructor(fragment=false){this.children=[];this.listeners={};this.fragment=fragment;this.clientHeight=100;this.top=0;this.extraHeight=0;}
  get scrollHeight(){return this.children.length*50+this.extraHeight;}
  get scrollTop(){return this.top;}set scrollTop(value){this.top=Math.max(0,Math.min(value,this.scrollHeight-this.clientHeight));}
  addEventListener(name,fn){this.listeners[name]=fn;}append(...nodes){for(const node of nodes)this.children.push(...(node.fragment?node.children:[node]));}
  replaceChildren(){this.children=[];this.top=0;}querySelector(){return null;}get lastChild(){return this.children.at(-1);}
 }
 const scope={window:{},performance:{now:()=>0},setTimeout:()=>1,clearTimeout:()=>{},document:{createDocumentFragment:()=>new Node(true),createElement:()=>new Node()}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/codex-messages.js'),'utf8'),scope);
 let visible=true,bottom;const node=new Node(),view=new scope.window.OgleMessages(node,new Map(),()=>visible,value=>{bottom=value;});
 const load=()=>{for(let i=0;i<100;i++)view.set('m'+i,'assistant','Message '+i);};
 const finish=()=>{while(view.pending.size)view.flush();};return {node,view,load,finish,setVisible:value=>{visible=value;},bottom:()=>bottom};
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


test('bottom button hides at bottom, shows after scrolling up, and hides after returning',()=>{
 const f=fixture();f.view.select('a');f.load();f.finish();assert.equal(f.bottom(),true);
 f.node.listeners.wheel({});f.node.scrollTop=1000;f.node.listeners.scroll();assert.equal(f.bottom(),false);
 f.view.toBottom();assert.equal(f.bottom(),true);
});

test('layout growth keeps bottom intent but preserves a deliberately scrolled-up position',()=>{
 const f=fixture();f.view.select('a');f.load();f.finish();
 f.node.extraHeight=500;f.view.layoutChanged();assert.equal(f.node.scrollTop,5400);assert.equal(f.bottom(),true);
 f.node.listeners.wheel({});f.node.scrollTop=1200;f.node.listeners.scroll();
 f.node.extraHeight=1000;f.view.layoutChanged();assert.equal(f.node.scrollTop,1200);assert.equal(f.bottom(),false);
});

test('reopening a bottom-following tab follows content that grew while hidden',()=>{
 const f=fixture();f.view.select('a');f.load();f.finish();f.view.remember();f.setVisible(false);
 f.node.extraHeight=700;f.view.set('new','assistant','Later message');f.setVisible(true);f.finish();
 assert.equal(f.node.scrollTop,5650);assert.equal(f.bottom(),true);
});

test('Ctrl wheel does not cancel bottom restoration during history load',()=>{
 const f=fixture();f.view.select('a');f.load();f.view.flush();const target=f.view.restore;
 f.node.listeners.wheel({ctrlKey:true});assert.equal(f.view.restore,target);f.finish();assert.equal(f.node.scrollTop,4900);
});
