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
  tabs:{get:async id=>({id,url,active:true,windowId:1}),captureVisibleTab:async()=>{commands.push({method:'captureVisibleTab'});throw Error('Screenshots mocked unavailable');},onUpdated:event('updated'),onRemoved:event('removed'),sendMessage:async(_id,m)=>{
    if(m.kind==='probe')return {url,viewport:{width:1440,height:757},checkpoint:cp};
    if(m.kind==='verifyPoint')return {matches:targetFound&&m.target?.text==='Search'};
    if(m.kind==='resolve')return targetFound?{x:150,y:160,editable:true}:null;
    return {ok:true};
  }},
  debugger:{attach:async()=>{},detach:async()=>{},onDetach:event('detach'),sendCommand:async(_t,method,params)=>{
    commands.push({method,params});if(method==='Page.captureScreenshot')throw Error('Screenshots mocked unavailable');return {};
  }}
};
await import('../extension/background.js');
const call=(kind,args={},sender={})=>new Promise((resolve,reject)=>listeners.message({kind,...(kind==='play'?{positionReplay:false}:{}),...args},sender,r=>r.ok?resolve(r.value):reject(Error(r.error))));
const recording=steps=>({format:'smallverse-mission',version:1,name:'Test only',startURL:url,viewport:{width:1440,height:757},minimumMs:180000,timingReviewed:true,steps:[{type:'checkpoint',at:0,checkpoint:cp,missionStart:true},...steps.map((step,i)=>({...step,...(i===0?{completionGate:true}:{})}))]});
const click=[{type:'pointerdown',at:0,x:100,y:120,button:'left',buttons:1,target:{tag:'button',text:'Search'}},{type:'pointerup',at:1,x:100,y:120,button:'left',buttons:0}];
async function waitFor(predicate){for(let i=0;i<100;i++){const v=await call('status');if(predicate(v))return v;await delay(20);}throw Error('Timed out');}
test('record, durable save, replay inputs, pause on missing targets, and stop cancellation',async()=>{
  await call('start',{tabId:1,name:'My recording'});
  assert(commands.some(c=>c.method==='captureVisibleTab'));
  assert(!commands.some(c=>c.method.startsWith('Emulation.')||c.method==='Page.captureScreenshot'));
  await call('event',{step:click[0]},{tab:{id:2}}); // Different tab cannot append.
  await call('event',{step:{...click[0],url,at:10}},{tab:{id:1}});
  await call('event',{step:{...click[1],url,at:20}},{tab:{id:1}});
  await call('stop');let state=await call('status');assert.equal(state.recordings[0].count,3); // initial checkpoint + two actions
  assert(!commands.some(c=>c.method.startsWith('Emulation.')));
  const imported=await call('import',{recording:recording(click)});
  commands.length=0;await call('play',{tabId:1,id:imported.id});await waitFor(v=>v.status.mode==='idle');
  const inputs=commands.filter(c=>c.method==='Input.dispatchMouseEvent');
  assert.equal(inputs[1].params.type,'mousePressed');assert.equal(inputs[1].params.x,150);assert.equal(inputs[2].params.x,150);assert.equal(inputs[2].params.type,'mouseReleased');
  targetFound=false;commands.length=0;await call('play',{tabId:1,id:imported.id});
  state=await waitFor(v=>v.status.mode==='paused');assert.match(state.status.message,/could not be located uniquely/);assert(!commands.some(c=>c.method.startsWith('Input.')));
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

test('recording toolbar sets timer and holds BEFORE the next final-task action',async()=>{
 cp={title:'Active objective',text:'After acceptance'};url='https://smallverse.app/space/easterisland';
 await call('start',{tabId:1,name:'Toolbar timer'});
 await call('markMissionStart',{}, {tab:{id:1},url});
 await call('markFinalTask',{}, {tab:{id:1},url});
 await call('event',{step:{...click[0],url,at:20}},{tab:{id:1}});
 await call('event',{step:{...click[1],url,at:21}},{tab:{id:1}});
 await call('stop');
 const saved=Object.values(local.recordings).find(r=>r.name==='Toolbar timer');
 assert(saved.timingReviewed);assert.equal(saved.steps.filter(s=>s.missionStart).length,1);assert.equal(saved.steps.find(s=>s.completionGate).type,'pointerdown');
});

test('continue recording preserves saved prefix and backup; refuses mismatched objective',async()=>{
  const imported=await call('import',{recording:recording(click)});
  const before=await call('get',{id:imported.id});
  const oldCP=cp;cp={title:'Different task',text:'Changed'};
  await assert.rejects(call('resumeRecording',{tabId:1,id:imported.id}),/differs/);cp=oldCP;
  const state=await call('resumeRecording',{tabId:1,id:imported.id});assert.equal(state.mode,'recording');
  assert.deepEqual((await call('get',{id:imported.id})).steps.slice(0,before.steps.length),before.steps);
  const backup=Object.values(local.recordings).find(r=>r.name===before.name+' — before continuation');assert.deepEqual(backup.steps,before.steps);
  await call('event',{step:{type:'text',at:0,url,value:'continued',target:{tag:'input'}}},{tab:{id:1}});
  await call('stop');const after=await call('get',{id:imported.id});
  assert.deepEqual(after.steps.slice(0,before.steps.length),before.steps);assert.equal(after.steps.at(-1).value,'continued');assert(after.steps.at(-1).at>=before.steps.at(-1).at);
});

test('debugger disconnect keeps recording and saves subsequent inputs until explicit stop',async()=>{
  await call('start',{tabId:1,name:'Disconnect recovery'});
  const id=temporary.activeRecording.id;
  listeners.detach({tabId:1});
  assert.equal((await call('status')).status.mode,'recording');
  await call('event',{step:{type:'text',at:10,url,value:'after disconnect',target:{tag:'input'}}},{tab:{id:1}});
  await call('contentReady',{}, {tab:{id:1}});
  await call('stop');
  assert.equal((await call('get',{id})).steps.at(-1).value,'after disconnect');
  assert.equal(temporary.activeRecording,null);
});

test('loading notifications within SmallVerse do not stop recording or discard later inputs',async()=>{
  await call('start',{tabId:1,name:'Loading signal regression'});
  const id=temporary.activeRecording.id;
  listeners.updated(1,{status:'loading'});
  listeners.updated(1,{url});
  await call('contentReady',{}, {tab:{id:1}});
  assert.equal((await call('status')).status.mode,'recording');
  await call('event',{step:{type:'text',at:50,url,value:'after loading',target:{tag:'input'}}},{tab:{id:1}});
  await call('stop');
  assert.equal((await call('get',{id})).steps.at(-1).value,'after loading');
});

test('position replay refuses unverified canvas and button clicks without sending input',async()=>{
  for(const target of [null,{tag:'button',text:'Missing button'}]){
    const imported=await call('import',{recording:recording(click.map(s=>({...s,...(s.type==='pointerdown'?{target}:{})})))});
    commands.length=0;await call('play',{tabId:1,id:imported.id,positionReplay:true});
    const paused=await waitFor(v=>v.status.mode==='paused');
    assert.match(paused.status.message,target?/missing, covered, or moved/:/no visual reference/);
    assert(!commands.some(c=>c.method.startsWith('Input.')));
    await call('stop');
  }
});

test('drag replay preserves middle button and final movement before release',async()=>{
  const moves=[{...click[0],button:'middle',buttons:4},{type:'pointermove',at:1,x:130,y:140,button:'none',buttons:4},{...click[1],at:2,button:'middle',x:145,y:160}];
  const imported=await call('import',{recording:recording(moves)});
  commands.length=0;await call('play',{tabId:1,id:imported.id});await waitFor(v=>v.status.mode==='idle');
  const events=commands.filter(c=>c.method==='Input.dispatchMouseEvent').map(c=>c.params);
  const drag=events.filter(e=>e.type==='mouseMoved'&&e.buttons===4);
  assert.equal(drag.length,2);assert(drag.every(e=>e.button==='middle'));
  assert.equal(drag.at(-1).x,195);assert.equal(events.at(-1).x,195);
});

test('position replay verifies a control at the original point without needing a visual patch',async()=>{
  targetFound=true;commands.length=0;
  const imported=await call('import',{recording:recording(click)});
  await call('play',{tabId:1,id:imported.id,positionReplay:true});await waitFor(v=>v.status.mode==='idle');
  const press=commands.find(c=>c.method==='Input.dispatchMouseEvent'&&c.params.type==='mousePressed');
  assert.equal(press.params.x,100);assert.equal(press.params.y,120);
  targetFound=false;commands.length=0;await call('play',{tabId:1,id:imported.id,positionReplay:true});
  await waitFor(v=>v.status.mode==='paused');assert(!commands.some(c=>c.method.startsWith('Input.')));
  await call('stop');targetFound=true;
});

test('continuous wheel replay checks the start and rechecks after a gesture gap',async()=>{
  const wheel={type:'wheel',at:0,x:100,y:120,deltaX:0,deltaY:-10,modifiers:2,target:{tag:'button',text:'Search'}};
  const imported=await call('import',{recording:recording([wheel,{...wheel,at:20,target:null},{...wheel,at:250,target:{tag:'button',text:'Missing button'}}])});
  commands.length=0;await call('play',{tabId:1,id:imported.id,positionReplay:true});
  const state=await waitFor(v=>v.status.mode==='paused');assert.equal(state.status.index,3);
  const events=commands.filter(c=>c.method==='Input.dispatchMouseEvent'&&c.params.type==='mouseWheel');
  assert.equal(events.length,2);assert(events.every(c=>c.params.modifiers===2&&c.params.deltaY===-10));
  await call('stop');
});

test('visual check retries transient frames before sending the saved click',async()=>{
  const oldCapture=chrome.tabs.captureVisibleTab,oldBitmap=globalThis.createImageBitmap,oldCanvas=globalThis.OffscreenCanvas;
  let captures=0;
  const patch={width:8,height:8,offsetX:4,offsetY:4,data:Array.from({length:64},(_,i)=>(i*37)%256)};
  chrome.tabs.captureVisibleTab=async()=>{captures++;return 'data:text/plain,test';};
  globalThis.createImageBitmap=async()=>({width:2880,height:1514,close(){}});
  globalThis.OffscreenCanvas=class{getContext(){return {drawImage(){},getImageData(){const data=new Uint8Array(720*379*4);if(captures>=3)for(let y=0;y<8;y++)for(let x=0;x<8;x++){const index=((56+y)*720+46+x)*4;data.fill(patch.data[y*8+x],index,index+3);}return {data};}};}};
  try{
    const imported=await call('import',{recording:recording([{...click[0],target:null,patch},click[1]])});
    commands.length=0;await call('play',{tabId:1,id:imported.id,positionReplay:true});await waitFor(v=>v.status.mode==='idle');
    assert.equal(captures,3);
    assert.equal(commands.filter(c=>c.method==='Input.dispatchMouseEvent'&&c.params.type==='mousePressed').length,1);
  }finally{await call('stop');chrome.tabs.captureVisibleTab=oldCapture;globalThis.createImageBitmap=oldBitmap;globalThis.OffscreenCanvas=oldCanvas;}
});

test('same-space loading and debugger detachment preserve playback progress for resume',async()=>{
  const imported=await call('import',{recording:recording(click.map(s=>({...s,at:s.at+2000})))});
  commands.length=0;await call('play',{tabId:1,id:imported.id});
  await waitFor(v=>v.status.index===1);
  listeners.updated(1,{status:'loading'});assert.equal((await call('status')).status.mode,'playing');
  listeners.detach({tabId:1});await waitFor(v=>v.status.mode==='paused');
  assert.equal(local.activePlayback.index,1);assert.equal(local.activePlayback.id,imported.id);
  assert.equal(local.playbackRecording.id,imported.id);
  assert(!commands.some(c=>c.method.startsWith('Input.')));
  await call('pause',{tabId:1});assert.equal((await call('status')).status.mode,'playing');
  await call('stop');assert.equal(local.activePlayback,null);
});

test('explicit objective resume rejects wrong state and resumes a later verified checkpoint',async()=>{
  const first={title:'First',text:'earlier'},later={title:'[7]',text:'Open the gates'};
  const r=recording([{type:'checkpoint',at:1,checkpoint:later},{type:'text',at:2,value:'bob, open the gates',target:{tag:'input'},checkpoint:later},...click.map(s=>({...s,at:5000+s.at,checkpoint:later}))]);
  r.steps[0].checkpoint=first;delete r.steps[1].completionGate;r.steps[3].completionGate=true;
  const imported=await call('import',{recording:r});cp=first;commands.length=0;
  await assert.rejects(call('resumeObjective',{tabId:1,id:imported.id,index:1}),/does not match/);
  assert(!commands.some(c=>c.method.startsWith('Input.')));
  cp=later;await call('resumeObjective',{tabId:1,id:imported.id,index:1});
  await waitFor(v=>v.status.index===3);
  assert(commands.some(c=>c.method==='Input.insertText'&&c.params.text==='bob, open the gates'));
  await call('stop');
});

test('radial finishing click waits for minimum time then uses live coordinates for press and release',async()=>{
  autoClock=false;clock=0;targetFound=true;cp={title:'Last task',text:'Use the car'};
  const down={...click[0],target:{tag:'button',text:'*'},waitForRadial:true,checkpoint:cp,at:30000,completionGate:true};
  const r=recording([{...click[0],at:0,checkpoint:cp},{...click[1],at:1},down,{...click[1],at:30001}]);
  delete r.steps[1].completionGate;
  const imported=await call('import',{recording:r});commands.length=0;
  await call('play',{tabId:1,id:imported.id,positionReplay:true});
  try{
    await waitFor(v=>v.status.remainingMs===180000);
    assert.equal(commands.filter(c=>c.method==='Input.dispatchMouseEvent'&&c.params.type==='mousePressed').length,1);
    clock=180000;await waitFor(v=>v.status.mode==='idle');
    const events=commands.filter(c=>c.method==='Input.dispatchMouseEvent').map(c=>c.params);
    const lastPress=events.filter(c=>c.type==='mousePressed').at(-1);
    assert.equal(lastPress.x,150);assert.equal(lastPress.y,160);
    assert.equal(events.at(-1).type,'mouseReleased');assert.equal(events.at(-1).x,150);assert.equal(events.at(-1).y,160);
  }finally{await call('stop');autoClock=true;}
});

test('reviewed hidden-target repair fails closed when scene capture is unavailable',async()=>{
 url='https://smallverse.app/space/easterisland';cp={title:'Dark room',text:'Use the door'};
 const patch={width:8,height:8,offsetX:4,offsetY:4,data:Array.from({length:64},(_,i)=>i*3)};
 const anchors=[{x:100,y:100,patch},{x:300,y:200,patch},{x:500,y:100,patch}];
 const r=recording(click.map((s,i)=>i? s:{...s,target:null,checkpoint:cp,sceneAnchors:anchors}));
 const imported=await call('import',{recording:r});commands.length=0;
 await call('play',{tabId:1,id:imported.id,positionReplay:true});
 await waitFor(v=>v.status.mode==='paused');assert(!commands.some(c=>c.method.startsWith('Input.')));
 await call('stop');
});

test('adaptive replay waits after Walk To before inserting chat text',async()=>{
 const oldCapture=chrome.tabs.captureVisibleTab,oldBitmap=globalThis.createImageBitmap,oldCanvas=globalThis.OffscreenCanvas;let captures=0;
 chrome.tabs.captureVisibleTab=async()=>{captures++;commands.push({method:'motionCapture',captures});return 'data:text/plain,test';};
 globalThis.createImageBitmap=async()=>({width:2880,height:1514,close(){}});
 globalThis.OffscreenCanvas=class{getContext(){return {drawImage(){},getImageData(){const data=new Uint8Array(720*379*4);for(let i=0;i<720*379;i++){const v=(i*7+(i%720)**2)%256;data.fill(v,i*4,i*4+3);}if(captures<4)for(let y=40;y<80;y++)for(let x=40+captures*4;x<80+captures*4;x++)data.fill(0,(y*720+x)*4,(y*720+x)*4+3);return {data};}};}};
 try{
  url='https://smallverse.app/space/easterisland';cp={title:'Walk',text:'Approach then speak'};targetFound=true;
  const r=recording([{...click[0],target:{tag:'button',aria:'Walk To'}},click[1],{type:'text',at:2,value:'hello',target:{tag:'input'},checkpoint:cp}]);
  const imported=await call('import',{recording:r});commands.length=0;await call('play',{tabId:1,id:imported.id,positionReplay:false});
  for(let i=0;i<150;i++){if((await call('status')).status.mode==='idle')break;await delay(50);}
  assert.equal((await call('status')).status.mode,'idle');
  const at=commands.findIndex(c=>c.method==='Input.insertText');assert(at>0);assert(commands.slice(0,at).filter(c=>c.method==='motionCapture').length>=7);
 }finally{await call('stop');chrome.tabs.captureVisibleTab=oldCapture;globalThis.createImageBitmap=oldBitmap;globalThis.OffscreenCanvas=oldCanvas;}
});
