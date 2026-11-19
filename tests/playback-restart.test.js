import test from 'node:test';
import assert from 'node:assert/strict';
const cp={title:'[7]',text:'Open the gates'},id='00000000-0000-4000-8000-000000000001',url='https://smallverse.app/space/test';
const r={format:'smallverse-mission',version:3,id,name:'Restored',startURL:url,viewport:{width:1440,height:757},minimumMs:180000,timingReviewed:true,steps:[
 {type:'checkpoint',at:0,checkpoint:{title:'[1]',text:'Start'},missionStart:true},
 {type:'text',at:0,value:'already sent',target:{tag:'input'}},
 {type:'checkpoint',at:0,checkpoint:cp},
 {type:'text',at:0,value:'bob, open the gates',target:{tag:'input'},checkpoint:cp},
 {type:'pointerdown',at:60000,x:50,y:50,button:'left',buttons:1,completionGate:true}
]};
const local={recordings:{[id]:r},playbackRecording:r,activePlayback:{version:1,id,tabId:7,index:3,elapsedMs:60000,positionReplay:true,inFlight:false,buttons:0,heldKeys:[],documentToken:'old-document'}},temporary={},listeners={},commands=[];
let observed={title:'Wrong',text:'Not the saved objective'};
const storage=obj=>({get:async key=>Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,structuredClone(obj[k])])),set:async value=>Object.assign(obj,structuredClone(value))});
const event=name=>({addListener:fn=>{listeners[name]=fn;}});
globalThis.chrome={storage:{local:storage(local),session:storage(temporary)},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},commands:{onCommand:event('command')},alarms:{create:async()=>{},onAlarm:event('alarm')},scripting:{executeScript:async()=>{}},tabs:{get:async id=>({id,url,active:true}),onUpdated:event('updated'),onRemoved:event('removed'),sendMessage:async(id,m)=>m.kind==='probe'?{url,viewport:r.viewport,checkpoint:observed,documentToken:'new-document'}:m.kind==='resolve'?{editable:true,x:20,y:20}:{ok:true}},debugger:{attach:async()=>{},detach:async()=>{},onDetach:event('detach'),sendCommand:async(_target,method,params)=>{if(method.startsWith('Input.'))assert(local.activePlayback.inFlight,'journal must be written before dispatch');commands.push({method,params});return {};}}};
await import('../extension/background.js');
const call=(kind,args={})=>new Promise((resolve,reject)=>listeners.message({kind,...args},{},r=>r.ok?resolve(r.value):reject(Error(r.error))));
test('fresh worker recovers exact position, validates objective, and does not replay earlier chat',async()=>{
 const before=await call('status');assert.equal(before.status.mode,'paused');assert.equal(before.status.index,3);
 assert.equal(commands.length,0);
 await assert.rejects(call('pause',{tabId:7}),/differs/);
 observed=cp;await call('pause',{tabId:7});
 try{
  let state;for(let i=0;i<50;i++){state=await call('status');if(state.status.index===4)break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(state.status.index,4);
  assert.deepEqual(commands.filter(c=>c.method==='Input.insertText').map(c=>c.params.text),['bob, open the gates']);
  assert.equal(local.activePlayback.index,4);assert.equal(local.activePlayback.inFlight,false);
 }finally{await call('stop');}
 assert.equal(local.activePlayback,null);
});
