import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../extension/content.js',import.meta.url),'utf8');
function setup(){
  const listeners={},messages=[],handlers=[],timers=new Map();let next=0,hit=null;
  class Element{
    constructor(tag='DIV',sensitive=false){this.tagName=tag;this.textContent='';this.value='';this.private=sensitive;this.style={};this.children=[];}
    closest(selector){if(selector.includes('password'))return this.private?this:null;if(selector==='#sv-recorder-overlay')return null;if(selector.includes('button,a,input'))return ['INPUT','BUTTON'].includes(this.tagName)?this:null;return null;}
    matches(){return this.tagName==='INPUT';}getAttribute(attr){return attr==='placeholder'?'Type here to chat':null;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}querySelector(){return null;}querySelectorAll(){return [];}getClientRects(){return [1];}
  }
  const document={elementFromPoint:()=>hit,documentElement:new Element(),createElement:tag=>new Element(tag.toUpperCase()),addEventListener:(type,fn)=>{listeners[type]=fn;},querySelectorAll:()=>[]};
  const sandbox={crypto:{randomUUID:()=> 'test-document'},window:{addEventListener:document.addEventListener},Element,document,innerWidth:1440,innerHeight:757,devicePixelRatio:1,location:{href:'https://smallverse.app/space/easterisland'},Date,MutationObserver:class{observe(){}disconnect(){}},setTimeout:fn=>{const id=++next;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval:()=>{},getComputedStyle:()=>({visibility:'visible'}),chrome:{runtime:{sendMessage:m=>{messages.push(m);return Promise.resolve({});},onMessage:{addListener:fn=>handlers.push(fn)}}}};
  vm.runInNewContext(source,sandbox);
  const message=m=>{let out;handlers[0](m,{},v=>out=v);return out;};
  message({kind:'mode',mode:'recording',started:Date.now()});messages.length=0;
  const event=(type,extra={})=>listeners[type]({isTrusted:true,target:new Element('INPUT'),key:'',buttons:0,clientX:100,clientY:120,button:0,...extra});
  return {messages,message,event,Element,setSend:fn=>{sandbox.chrome.runtime.sendMessage=fn;},root:document.documentElement,setHeadings:value=>{document.querySelectorAll=selector=>selector==='h3'?value:[];},setHit:value=>{hit=value;}};
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

test('fast camera drags preserve every delivered move and wheel units',()=>{
  const s=setup(),canvas=new s.Element('CANVAS');
  s.event('pointerdown',{target:canvas,button:1,buttons:4});
  for(let i=0;i<5;i++)s.event('pointermove',{target:canvas,button:-1,buttons:4,clientX:100+i,clientY:120+i});
  s.event('pointerup',{target:canvas,button:1,buttons:0,clientX:110,clientY:130});
  s.event('wheel',{target:canvas,deltaMode:1,deltaX:2,deltaY:-3});
  const steps=s.messages.filter(m=>m.kind==='event').map(m=>m.step);
  assert.equal(steps.filter(s=>s.type==='pointermove').length,5);
  assert.equal(steps[0].button,'middle');assert.equal(steps.at(-1).deltaY,-48);assert.equal(steps.at(-1).deltaX,32);
});

test('coalesced drag samples retain their path and pinch-wheel modifiers',()=>{
  const s=setup(),canvas=new s.Element('CANVAS');
  s.event('pointerdown',{target:canvas,buttons:2,button:2});
  s.event('pointermove',{target:canvas,buttons:2,button:-1,timeStamp:100,clientX:180,clientY:150,getCoalescedEvents:()=>[
    {clientX:120,clientY:130,timeStamp:80},{clientX:160,clientY:145,timeStamp:90},{clientX:180,clientY:150,timeStamp:100}
  ]});
  s.event('pointerup',{target:canvas,button:2,clientX:180,clientY:150});
  s.event('wheel',{target:canvas,ctrlKey:true,deltaMode:0,deltaX:0,deltaY:-6});
  const steps=s.messages.filter(m=>m.kind==='event').map(m=>m.step),moves=steps.filter(s=>s.type==='pointermove');
  assert.deepEqual(moves.map(m=>m.x),[120,160,180]);assert(moves.every(m=>m.buttons===2));
  assert(moves.every((m,i)=>!i||m.at>=moves[i-1].at));
  assert.equal(steps.at(-1).modifiers,2);assert.equal(steps.at(-1).deltaY,-6);
});

test('button verification requires the exact visible enabled control under the saved point',()=>{
  const s=setup(),button=new s.Element('BUTTON');button.textContent='*';s.setHit(button);
  s.event('pointerdown',{target:button,buttons:1});
  const target=s.messages.find(m=>m.kind==='event').step.target;
  const verify=()=>s.message({kind:'verifyPoint',target,x:100,y:120}).matches;
  assert.equal(verify(),true);
  button.textContent='Other';assert.equal(verify(),false);button.textContent='*';
  button.disabled=true;assert.equal(verify(),false);button.disabled=false;
  s.setHit(new s.Element('DIV'));assert.equal(verify(),false);
  s.setHit(null);assert.equal(verify(),false);
});

test('hover identity requires a unique visible heading and exact description, with or without DOM whitespace',()=>{
 const s=setup(),h=new s.Element('H3'),box=new s.Element();h.textContent='White Door';h.parentElement=box;box.getBoundingClientRect=()=>({left:400,top:200,right:600,bottom:300});s.setHeadings([h]);
 const check=()=>s.message({kind:'hoverIdentity',identity:{title:'White Door',text:'A white wooden door.'}}).matches;
 for(const text of ['White DoorA white wooden door.','White Door A white wooden door.']){box.textContent=text;assert.equal(check(),true);}
 box.textContent='White Door A different door.';assert.equal(check(),false);
 box.textContent='White Door A white wooden door.';box.getBoundingClientRect=()=>({left:400,top:-100,right:600,bottom:-10});assert.equal(check(),false);
 box.getBoundingClientRect=()=>({left:400,top:200,right:600,bottom:300});const h2=new s.Element('H3'),box2=new s.Element();h2.textContent=h.textContent;h2.parentElement=box2;box2.textContent=box.textContent;box2.getBoundingClientRect=box.getBoundingClientRect;s.setHeadings([h,h2]);assert.equal(check(),false);
});

test('extension reload catches synchronous and asynchronous invalidation and stops old recording listeners',async()=>{
 for(const asyncError of [false,true]){
  const s=setup();let calls=0;s.setSend(()=>{calls++;if(asyncError)return Promise.reject(Error('Extension context invalidated.'));throw Error('Extension context invalidated.');});
  assert.doesNotThrow(()=>s.event('pointerdown',{target:new s.Element('CANVAS'),buttons:1}));await new Promise(r=>setImmediate(r));
  s.event('pointerdown',{target:new s.Element('CANVAS'),buttons:1});s.event('keydown',{key:'Escape'});assert.equal(calls,1);
  const overlay=s.root.children.find(e=>e.id==='sv-recorder-overlay');assert.match(overlay.children[0].textContent,/Refresh this game tab/);assert.equal(overlay.hidden,false);
 }
});

test('wheel input records device-independent pixel amounts, both axes, page units and named zoom controls',()=>{
 const s=setup(),canvas=new s.Element('CANVAS'),button=new s.Element('BUTTON');button.textContent='Zoom in';
 s.event('wheel',{target:canvas,deltaMode:0,deltaX:1.25,deltaY:-3.75,ctrlKey:true});
 s.event('wheel',{target:canvas,deltaMode:2,deltaX:1,deltaY:-1});
 s.event('wheel',{target:button,deltaMode:0,deltaX:0,deltaY:-10});
 const events=s.messages.filter(m=>m.kind==='event').map(m=>m.step);
 assert.equal(events[0].deltaX,1.25);assert.equal(events[0].deltaY,-3.75);assert.equal(events[0].modifiers,2);
 assert.equal(events[1].deltaX,1440);assert.equal(events[1].deltaY,-757);assert.equal(events[2].target.text,'Zoom in');
});

test('overlay offers paused task search and read-only alignment with a verified screen marker',async()=>{
 const s=setup(),all=()=>{const found=[];function visit(e){found.push(e);for(const c of e.children||[])visit(c);}visit(s.root);return found;},button=text=>all().find(e=>e.textContent===text);
 const calls=[];s.setSend(async m=>{calls.push(m);return {ok:true,value:m.kind==='overlayTasks'?{tasks:[{index:3,checkpoint:{title:'Task 4',text:'Open door'}}],currentIndex:3,matches:1,viewport:{width:1440,height:757}}:m.kind==='overlayCheckView'?{message:'Target found',point:{x:230,y:240}}:{}};});
 s.message({kind:'mode',mode:'playing'});assert(button('Tasks').disabled);
 s.message({kind:'mode',mode:'paused'});assert(!button('Tasks').disabled);await button('Tasks').onclick();
 assert(all().some(e=>e.placeholder==='Search recorded tasks'));assert(!button('Resume detected task').disabled);
 await button('Adjust view').onclick();await button('Adapt & check view').onclick();
 assert.equal(calls.at(-1).kind,'overlayCheckView');assert(all().some(e=>e.textContent==='Next target found'));
 const marker=all().find(e=>e.style.left==='230px'&&e.style.top==='240px');assert(marker&&!marker.hidden);
 s.event('wheel',{target:new s.Element('CANVAS'),deltaX:0,deltaY:5});assert(marker.hidden);
 await button('Adapt & check view').onclick();assert(!marker.hidden);
 s.message({kind:'mode',mode:'playing'});assert(marker.hidden);
});
