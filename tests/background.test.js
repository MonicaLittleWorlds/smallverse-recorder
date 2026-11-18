import test from 'node:test';
import assert from 'node:assert/strict';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const listeners={},local={},temporary={},commands=[];
let cp={title:'SEARCH DEBRIS',text:'Find food'},targetFound=true,url='https://smallverse.app/space/easterisland';
const event=name=>({addListener:fn=>listeners[name]=fn});
const storage=object=>({get:async key=>structuredClone({[key]:object[key]}),set:async values=>Object.assign(object,structuredClone(values))});
globalThis.chrome={
  storage:{local:storage(local),session:storage(temporary)},
  runtime:{onMessage:event('message')},
  action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  commands:{onCommand:event('command')},
  scripting:{executeScript:async()=>{}},
  tabs:{get:async id=>({id,url}),onUpdated:event('updated'),onRemoved:event('removed'),sendMessage:async(_id,m)=>{
    if(m.kind==='probe')return {url,viewport:{width:1440,height:757},checkpoint:cp};
    if(m.kind==='resolve')return targetFound?{x:150,y:160,editable:true}:null;
    return {ok:true};
  }},
  debugger:{attach:async()=>{},detach:async()=>{},onDetach:event('detach'),sendCommand:async(_t,method,params)=>{
    commands.push({method,params});if(method==='Page.captureScreenshot')throw Error('Screenshots mocked unavailable');return {};
  }}
};
await import('../extension/background.js');
const call=(kind,args={},sender={})=>new Promise((resolve,reject)=>listeners.message({kind,...args},sender,r=>r.ok?resolve(r.value):reject(Error(r.error))));
const recording=steps=>({format:'smallverse-mission',version:1,name:'Test only',startURL:url,viewport:{width:1440,height:757},steps});
const click=[{type:'pointerdown',at:0,x:100,y:120,button:'left',buttons:1,target:{tag:'button',text:'Search'}},{type:'pointerup',at:1,x:100,y:120,button:'left',buttons:0}];
async function waitFor(predicate){for(let i=0;i<100;i++){const v=await call('status');if(predicate(v))return v;await delay(20);}throw Error('Timed out');}
test('record, durable save, replay inputs, pause on missing targets, and stop cancellation',async()=>{
  await call('start',{tabId:1,name:'My recording'});
  await call('event',{step:click[0]},{tab:{id:2}}); // Different tab cannot append.
  await call('event',{step:{...click[0],url,at:10}},{tab:{id:1}});
  await call('event',{step:{...click[1],url,at:20}},{tab:{id:1}});
  await call('stop');let state=await call('status');assert.equal(state.recordings[0].count,3); // initial checkpoint + two actions
  assert(commands.some(c=>c.method==='Emulation.setDeviceMetricsOverride'&&c.params.width===1440));
  const imported=await call('import',{recording:recording(click)});
  commands.length=0;await call('play',{tabId:1,id:imported.id});await waitFor(v=>v.status.mode==='idle');
  const inputs=commands.filter(c=>c.method==='Input.dispatchMouseEvent');
  assert.equal(inputs[1].params.type,'mousePressed');assert.equal(inputs[1].params.x,150);assert.equal(inputs[2].params.x,150);assert.equal(inputs[2].params.type,'mouseReleased');
  targetFound=false;commands.length=0;await call('play',{tabId:1,id:imported.id});
  state=await waitFor(v=>v.status.mode==='paused');assert.match(state.status.message,/missing or covered/);assert(!commands.some(c=>c.method.startsWith('Input.')));
  await call('stop');targetFound=true;
  const long=await call('import',{recording:recording(click.map(s=>({...s,at:s.at+5000})))});
  await call('play',{tabId:1,id:long.id});await call('stop');commands.length=0;await delay(150);assert(!commands.some(c=>c.method.startsWith('Input.')));
});
test('wrong space is rejected before attaching; shared downloads have fixed paths',async()=>{
  const imported=await call('import',{recording:recording(click)});url='https://smallverse.app/space/other';commands.length=0;
  await assert.rejects(call('play',{tabId:1,id:imported.id}),/starting space/);assert.equal(commands.length,0);
  await assert.rejects(call('sharedImport',{path:'https://evil.example/a.json'}),/Invalid recording path/);
});
