import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../extension/content.js',import.meta.url),'utf8');
function setup(){
  const listeners={},messages=[],handlers=[],timers=new Map();let next=0;
  class Element{
    constructor(tag='DIV',sensitive=false){this.tagName=tag;this.textContent='';this.value='';this.private=sensitive;this.style={};this.children=[];}
    closest(selector){if(selector.includes('password'))return this.private?this:null;if(selector==='#sv-recorder-overlay')return null;if(selector.includes('button,a,input'))return this.tagName==='INPUT'?this:null;return null;}
    matches(){return this.tagName==='INPUT';}getAttribute(attr){return attr==='placeholder'?'Type here to chat':null;}append(...nodes){this.children.push(...nodes);}querySelector(){return null;}querySelectorAll(){return [];}getClientRects(){return [1];}
  }
  const document={documentElement:new Element(),createElement:tag=>new Element(tag.toUpperCase()),addEventListener:(type,fn)=>{listeners[type]=fn;},querySelectorAll:()=>[]};
  const sandbox={Element,document,innerWidth:1440,innerHeight:757,devicePixelRatio:1,location:{href:'https://smallverse.app/space/easterisland'},Date,MutationObserver:class{observe(){}},setTimeout:fn=>{const id=++next;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,getComputedStyle:()=>({visibility:'visible'}),chrome:{runtime:{sendMessage:m=>{messages.push(m);return Promise.resolve({});},onMessage:{addListener:fn=>handlers.push(fn)}}}};
  vm.runInNewContext(source,sandbox);
  const message=m=>{let out;handlers[0](m,{},v=>out=v);return out;};
  message({kind:'mode',mode:'recording',started:Date.now()});messages.length=0;
  const event=(type,extra={})=>listeners[type]({isTrusted:true,target:new Element('INPUT'),key:'',buttons:0,clientX:100,clientY:120,button:0,...extra});
  return {messages,message,event,Element};
}
test('typing flushes before Enter, and passwords are excluded',()=>{
  const s=setup(),input=new s.Element('INPUT');input.value='knock knock';s.event('input',{target:input});s.event('keydown',{target:input,key:'Enter',code:'Enter',keyCode:13});
  const events=s.messages.filter(m=>m.kind==='event');assert.equal(events[0].step.type,'text');assert.equal(events[0].step.value,'knock knock');assert.equal(events[1].step.type,'keydown');
  const secret=new s.Element('INPUT',true);secret.value='secret';s.event('input',{target:secret});s.message({kind:'flush'});assert(!JSON.stringify(s.messages).includes('secret'));
});
test('stop flushes pending field text and synthetic inputs are ignored',()=>{
  const s=setup(),input=new s.Element('INPUT');input.value='hello';s.event('input',{target:input});s.message({kind:'flush'});assert.equal(s.messages.at(-1).step.value,'hello');
  const count=s.messages.length;s.event('pointerdown',{isTrusted:false});assert.equal(s.messages.length,count);
});
test('records canvas pointer coordinates and drag samples',()=>{
  const s=setup();s.event('pointerdown',{target:new s.Element('CANVAS'),buttons:1});s.event('pointermove',{target:new s.Element('CANVAS'),buttons:1,clientX:140});s.event('pointerup',{target:new s.Element('CANVAS'),clientX:140});
  const events=s.messages.filter(m=>m.kind==='event');assert.equal(events.length,3);assert.equal(events[0].step.target,null);assert.equal(events[1].step.x,140);assert.equal(events[2].step.buttons,0);
});
test('Escape requests stop without recording escape as a game action',()=>{const s=setup();s.event('keydown',{key:'Escape'});assert.equal(s.messages.at(-1).kind,'stop');});
