import test, {mock} from 'node:test';
let clock=0,autoClock=true;
mock.method(performance,'now',()=>{if(autoClock)clock+=200000;return clock;});
import assert from 'node:assert/strict';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const listeners={},local={},temporary={},commands=[];
let cp={title:'SEARCH DEBRIS',text:'Find food'},targetFound=true,url='https://smallverse.app/space/easterisland';
const event=name=>({addListener:fn=>listeners[name]=fn});
const storage=object=>({get:async key=>structuredClone({[key]:object[key]}),set:async values=>Object.assign(object,structuredClone(values))});
globalThis.chrome={
  storage:{local:storage(local),session:storage(temporary)},
  runtime:{getURL:path=>'chrome-extension://recorder/'+path,onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},
  action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  commands:{onCommand:event('command')},
  alarms:{create:async()=>{},onAlarm:event('alarm')},
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
const recording=steps=>({format:'smallverse-mission',version:1,name:'Test only',startURL:url,viewport:{width:1440,height:757},minimumMs:180000,timingReviewed:true,steps:[{type:'checkpoint',at:0,checkpoint:cp,missionStart:true},...steps.map((step,i)=>({...step,...(i===0?{completionGate:true}:{})}))]});
const click=[{type:'pointerdown',at:0,x:100,y:120,button:'left',buttons:1,target:{tag:'button',text:'Search'}},{type:'pointerup',at:1,x:100,y:120,button:'left',buttons:0}];
async function waitFor(predicate){for(let i=0;i<100;i++){const v=await call('status');if(predicate(v))return v;await delay(20);}throw Error('Timed out');}
test('record, durable save, replay inputs, pause on missing targets, and stop cancellation',async()=>{
  await call('start',{tabId:1,name:'My recording'});
  const capture=commands.find(c=>c.method==='Page.captureScreenshot');
  assert.equal(capture.params.fromSurface,false); // Must not reset emulation scale per frame.
  assert.equal(capture.params.captureBeyondViewport,false);
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

test('three-minute hold blocks finishing inputs, supports pause and cannot be bypassed by coordinate fallback',async()=>{
  url='https://smallverse.app/space/easterisland';autoClock=false;clock=0;targetFound=true;
  const imported=await call('import',{recording:recording(click)});
  commands.length=0;await call('play',{tabId:1,id:imported.id});
  await waitFor(v=>v.status.remainingMs===180000);
  assert(!commands.some(c=>c.method.startsWith('Input.')));
  clock=179999;await delay(130);assert(!commands.some(c=>c.method.startsWith('Input.')));
  await call('pause');await call('coordinates');await delay(130);
  assert(!commands.some(c=>c.method.startsWith('Input.')));
  clock=180000;await waitFor(v=>v.status.mode==='idle');
  assert(commands.some(c=>c.method==='Input.dispatchMouseEvent'&&c.params.type==='mousePressed'));
  clock=0;commands.length=0;await call('play',{tabId:1,id:imported.id});
  await waitFor(v=>v.status.remainingMs===180000);await call('stop');commands.length=0;clock=300000;await delay(150);
  assert(!commands.some(c=>c.method.startsWith('Input.')));
  autoClock=true;
});
test('unreviewed legacy recordings cannot replay without timing setup',async()=>{
  const r=recording(click);delete r.timingReviewed;
  const imported=await call('import',{recording:r});
  await assert.rejects(call('play',{tabId:1,id:imported.id}),/Confirm the timer/);
});

test('shared sync adds to replay library, requires per-version review and preserves personal edits',async()=>{
  url='https://smallverse.app/space/easterisland';
  const r=recording(click),raw=JSON.stringify(r);
  const fetchMock=mock.method(globalThis,'fetch',async address=>new Response(String(address).endsWith('index.json')?JSON.stringify([{name:r.name,path:'recordings/test.json',author:'Contributor'}]):raw));
  const beforePersonal=Object.keys(local.recordings).length;
  await call('sync',{force:true});
  let state=await call('status'),shared=state.recordings.find(r=>r.source);
  assert(shared);assert(shared.reviewRequired);assert.equal(shared.source.author,'Contributor');
  assert.equal(Object.keys(local.recordings).length,beforePersonal);
  await assert.rejects(call('play',{tabId:1,id:shared.id}),/Review this shared version/);
  const original=await call('get',{id:shared.id});
  await call('approveShared',{id:shared.id,hash:shared.source.hash});
  assert.equal((await call('status')).recordings.find(r=>r.id===shared.id).reviewRequired,false);
  const copy={...original,name:'My edited copy'};const saved=await call('save',{recording:copy});assert(saved.personalCopy);assert.notEqual(saved.id,shared.id);
  assert.equal((await call('get',{id:shared.id})).name,r.name);
  assert.equal((await call('get',{id:saved.id})).source,undefined);
  fetchMock.mock.mockImplementation(async address=>new Response(String(address).endsWith('index.json')?JSON.stringify([{name:r.name,path:'recordings/test.json',author:'Contributor'}]):JSON.stringify({...r,notes:'Updated'})));
  await call('sync',{force:true});
  assert((await call('status')).recordings.find(r=>r.id===shared.id).reviewRequired);
  assert.equal((await call('get',{id:saved.id})).name,'My edited copy');
  await assert.rejects(call('approveShared',{id:shared.id,hash:shared.source.hash}),/version changed/);
  fetchMock.mock.mockImplementation(async()=>{throw Error('Offline');});
  const failed=await call('sync',{force:true});assert.match(failed.error,/Offline/);
  assert((await call('get',{id:shared.id})).steps.length);
  fetchMock.mock.restore();
});


test('skipping an absent popup advances to next objective but preserves the three-minute hold',async()=>{
  url='https://smallverse.app/space/easterisland';autoClock=false;clock=0;targetFound=true;
  const before={title:'Collect',text:'Find an item'},popup={title:'Task complete',text:'You found it.'},next={title:'Next task',text:'Go to the beach'};
  cp=before;
  const r={...recording([]),version:3,steps:[
    {type:'checkpoint',at:0,checkpoint:before,missionStart:true},
    {type:'optionalPopup',at:1,popup,next,previous:before,target:{tag:'button',text:'Continue',dialog:popup.title,dialogText:popup.text}},
    {type:'checkpoint',at:5000,checkpoint:next},
    {...click[0],at:5001,completionGate:true},
    {...click[1],at:5002}
  ]};
  const imported=await call('import',{recording:r});commands.length=0;
  await call('play',{tabId:1,id:imported.id});
  await waitFor(v=>v.status.index===1);cp=next;
  await waitFor(v=>v.status.remainingMs===180000);
  assert(!commands.some(c=>c.method.startsWith('Input.')));
  clock=180000;await waitFor(v=>v.status.mode==='idle');
  assert.equal(commands.filter(c=>c.method==='Input.dispatchMouseEvent'&&c.params.type==='mousePressed').length,1);
  autoClock=true;
});


test('library tab can list and delete recordings while game tabs cannot',async()=>{
  const sender={url:'chrome-extension://recorder/library.html',tab:{id:9}};
  const saved=await call('import',{recording:recording(click)});
  assert((await call('status',{},sender)).recordings.some(r=>r.id===saved.id));
  await assert.rejects(call('delete',{id:saved.id},{url,tab:{id:1}}),/extension controls/);
  await call('delete',{id:saved.id},sender);
  assert(!(await call('status',{},sender)).recordings.some(r=>r.id===saved.id));
});
