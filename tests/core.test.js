import test from 'node:test';
import assert from 'node:assert/strict';
import {gameURL,sameSpace,validateRecording,exportRecording,checkpointEqual,matchPatch,missionTiming,remainingMissionMs,timingCandidates} from '../extension/core.js';
const recording=()=>({format:'smallverse-mission',version:1,name:'Demo mission',startURL:'https://smallverse.app/space/easterisland',viewport:{width:1440,height:757},steps:[]});
test('only exact SmallVerse HTTPS game pages are allowed',()=>{
  assert.equal(gameURL('https://smallverse.app/space/easterisland'),true);
  for(const url of ['https://smallverse.app.evil.test/space/x','https://smallverse.app/profile/','http://smallverse.app/space/x','javascript:alert(1)','file:///space/x'])assert.equal(gameURL(url),false);
  assert.equal(sameSpace('https://smallverse.app/space/a/1','https://smallverse.app/space/a/2'),true);
  assert.equal(sameSpace('https://smallverse.app/space/a','https://smallverse.app/space/b'),false);
});
test('objective checks include body text, not just repeated title',()=>{
  assert(checkpointEqual({title:'SEARCH',text:'one\n two'},{title:'SEARCH',text:'one two'}));
  assert(!checkpointEqual({title:'SEARCH',text:'one'},{title:'SEARCH',text:'two'}));
});
test('rejects unsafe or corrupt imported recordings',()=>{
  for(const step of [{type:'eval',at:0},{type:'pointerdown',at:0,x:-1,y:0},{type:'text',at:0,value:1},{type:'keydown',at:0,key:'a',code:'KeyA',keyCode:65,modifiers:4},{type:'wheel',at:0,x:0,y:0,deltaX:Infinity,deltaY:0}]){
    const r=recording();r.steps=[step];assert.throws(()=>validateRecording(r));
  }
  const r=recording();r.steps=[{type:'checkpoint',at:10},{type:'checkpoint',at:5}];assert.throws(()=>validateRecording(r));
});
test('public export strips local identifiers and arbitrary metadata',()=>{
  const r={...recording(),id:'private-id',created:'local',debug:'private',steps:[{type:'text',at:1,value:'knock knock',secret:'never export',target:{tag:'input'}}]};
  const e=exportRecording(r,{notes:'Start at beach'});
  assert.equal(e.id,undefined);assert.equal(e.debug,undefined);assert.equal(e.steps[0].secret,undefined);assert.equal(e.steps[0].value,'knock knock');
  assert.equal(exportRecording(r,{omitText:true}).steps.length,0);
});
function pattern(w,h){return Array.from({length:w*h},(_,i)=>(i*37+(i%w)*51+Math.floor(i/w)*29)%256);}
function scene(){return {width:140,height:90,data:new Uint8Array(140*90).fill(30)};}
function paint(f,p,x,y){for(let j=0;j<p.height;j++)for(let i=0;i<p.width;i++)f.data[(y+j)*f.width+x+i]=p.data[j*p.width+i];}
test('visual matching follows shifted targets and preserves click offset',()=>{
  const f=scene(),p={width:16,height:16,offsetX:5,offsetY:7,data:pattern(16,16)};paint(f,p,51,33);
  const result=matchPatch(f,p);assert(result);assert.equal(result.x,56);assert.equal(result.y,40);
});
test('visual matching refuses identical competing targets',()=>{
  const f=scene(),p={width:16,height:16,offsetX:8,offsetY:8,data:pattern(16,16)};paint(f,p,10,10);paint(f,p,80,50);assert.equal(matchPatch(f,p),null);
});
test('visual matching refuses blank terrain and missing targets',()=>{
  const f=scene();assert.equal(matchPatch(f,{width:16,height:16,offsetX:8,offsetY:8,data:Array(256).fill(30)}),null);
  assert.equal(matchPatch(f,{width:16,height:16,offsetX:8,offsetY:8,data:pattern(16,16)}),null);
});
test('recordings round-trip without code execution fields',()=>{
  const r=recording();r.steps=[{type:'pointerdown',at:1,x:100,y:100,button:'left',buttons:1,clickCount:2},{type:'pointerup',at:40,x:100,y:100,button:'left',buttons:0,clickCount:2}];
  assert.deepEqual(validateRecording(JSON.parse(JSON.stringify(exportRecording(r)))).steps,r.steps);
});

test('mission timer waits only the remaining time, with no early completion',()=>{
  assert.equal(remainingMissionMs(5000,165000),20000);
  assert.equal(remainingMissionMs(5000,184999),1);
  assert.equal(remainingMissionMs(5000,185000),0);
  assert.equal(remainingMissionMs(5000,250000),0);
  assert.throws(()=>remainingMissionMs(null,250000));
});
test('timing setup requires reviewed ordered markers at neutral input boundaries',()=>{
  const r=recording();r.timingReviewed=true;r.steps=[{type:'checkpoint',at:0,checkpoint:{title:'First objective',text:'After acceptance'},missionStart:true},{type:'pointerdown',at:10,x:1,y:1,buttons:1,completionGate:true},{type:'pointerup',at:11,x:1,y:1,buttons:0}];
  assert.deepEqual(missionTiming(r),{start:0,finish:1,minimumMs:180000});
  assert.deepEqual(timingCandidates(r.steps).finishes,[1]);
  const shared=exportRecording(r);assert.equal(shared.version,3);assert.equal(shared.steps[1].completionGate,true);assert.equal(shared.minimumMs,180000);assert.equal(shared.timingReviewed,true);
  delete r.steps[1].completionGate;r.steps[2].completionGate=true;assert.throws(()=>missionTiming(r),/invalid/);
  r.steps.splice(0,1);assert.throws(()=>missionTiming(r),/Review this mission/);
});
test('imports reject minimums below three minutes',()=>{const r=recording();r.minimumMs=179999;assert.throws(()=>validateRecording(r),/3 and 60/);});

test('recorded position guard rejects shifted, blank and missing references',async()=>{
  const {recordedPointMatches}=await import('../extension/core.js');
  const data=Array.from({length:64},(_,i)=>i*3),frame={width:8,height:8,scaleX:2,scaleY:2,data};
  const patch={width:4,height:4,offsetX:2,offsetY:2,data:[...data.slice(18,22),...data.slice(26,30),...data.slice(34,38),...data.slice(42,46)]};
  assert.equal(recordedPointMatches(frame,patch,8,8),true);
  assert.equal(recordedPointMatches(frame,patch,8,12),false);
  assert.equal(recordedPointMatches(frame,{...patch,data:Array(16).fill(10)},8,8),false);
  assert.equal(recordedPointMatches(frame,null,8,8),false);
});

test('fixed-position matching accepts faint detail but rejects flat or shifted patterns',async()=>{
  const {recordedPointMatches,sameWheelGesture}=await import('../extension/core.js');
  const data=Array.from({length:1024},(_,i)=>80+((i*17+Math.floor(i/32)*3)%11));
  const p={width:32,height:32,offsetX:16,offsetY:16,data};
  const f={width:32,height:32,scaleX:1,scaleY:1,data};
  assert(recordedPointMatches(f,p,16,16));
  assert(!recordedPointMatches({...f,data:data.map((_,i)=>data[(i+2)%1024])},p,16,16));
  assert(!recordedPointMatches({...f,data:Array(1024).fill(85)},p,16,16));
  const a={type:'wheel',at:100,x:50,y:50,modifiers:2};
  assert(sameWheelGesture(a,{...a,at:140}));
  for(const change of [{at:500},{x:80},{modifiers:0},{type:'pointerdown'}])assert(!sameWheelGesture(a,{...a,...change}));
});

test('partial visual check tolerates local occlusion but rejects wrong alignment and insufficient evidence',async()=>{
  const {recordedPointMatches}=await import('../extension/core.js');
  let seed=731;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed>>>24;};
  const p={width:32,height:32,offsetX:16,offsetY:16,data:Array.from({length:1024},rand)};
  const f={width:96,height:96,scaleX:1,scaleY:1,data:Array.from({length:9216},()=>20)};
  // A local avatar or menu obscures half of the reference.
  const partiallyVisible={...p,data:p.data.map((v,i)=>i%32<16?220:v)};
  paint(f,partiallyVisible,32,32);
  assert(recordedPointMatches(f,p,48,48));
  for(const [x,y]of [[44,48],[52,48],[48,44],[48,52],[40,40]])assert(!recordedPointMatches(f,p,x,y));
  assert(!recordedPointMatches({...f,data:Array(9216).fill(20)},p,48,48));
  const sparse={...p,data:p.data.map((v,i)=>Math.floor(i/32)<8&&i%32>=8?v:220)};
  paint(f,sparse,32,32);assert(!recordedPointMatches(f,p,48,48));
  const zoom={...p,data:p.data.map((_,i)=>p.data[Math.min(31,Math.floor(Math.floor(i/32)*.8))*32+Math.min(31,Math.floor((i%32)*.8))])};
  paint(f,zoom,32,32);assert(!recordedPointMatches(f,p,48,48));
});

test('partial visual check rejects repeating patterns as alignment evidence',async()=>{
  const {recordedPointMatches}=await import('../extension/core.js');
  const pattern=(x,y)=>((x%4)<2?40:200)+((y%4)<2?0:20);
  const p={width:32,height:32,offsetX:16,offsetY:16,data:Array.from({length:1024},(_,i)=>pattern(i%32,Math.floor(i/32)))};
  const f={width:96,height:96,scaleX:1,scaleY:1,data:Array.from({length:9216},(_,i)=>pattern(i%96,Math.floor(i/96)))};
  for(let y=32;y<64;y++)for(let x=32;x<48;x++)f.data[y*96+x]=0;
  assert(!recordedPointMatches(f,p,48,48));
});
