import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCatalog,syncShared,digest,sharedReviewed,prepareShare,readBounded} from '../extension/sharing.js';
const record=()=>({format:'smallverse-mission',version:2,name:'Sample mission',startURL:'https://smallverse.app/space/easterisland',viewport:{width:1440,height:757},minimumMs:180000,timingReviewed:true,steps:[{type:'checkpoint',at:0,checkpoint:{title:'First objective',text:'After acceptance'},missionStart:true},{type:'pointerdown',at:2,x:100,y:100,button:'left',buttons:1,completionGate:true},{type:'pointerup',at:3,x:100,y:100,button:'left',buttons:0}]});
const entry={name:'Sample mission',path:'recordings/sample.json',author:'Someone',revision:'1'};
test('catalog rejects external paths, duplicate entries and malformed checksums',()=>{
  assert.equal(validateCatalog([entry]).length,1);
  for(const value of [[{...entry,path:'https://evil.example/test.json'}],[entry,entry],[{...entry,path:'recordings/../test.json'}],[{...entry,sha256:'bad'}]])assert.throws(()=>validateCatalog(value));
});
test('sync deduplicates by path, honors checksums, refreshes metadata and retires removed entries',async()=>{
  const raw=JSON.stringify(record()),sha256=await digest(raw);let downloads=0;
  const get=async()=>{downloads++;return raw;};
  const first=await syncShared({},[{...entry,sha256}],get);assert.equal(first.added,1);const r=Object.values(first.recordings)[0];
  const second=await syncShared(first.recordings,[{...entry,sha256,author:'New author'}],get);assert.equal(downloads,1);assert.equal(second.unchanged,1);assert.equal(Object.values(second.recordings)[0].source.author,'New author');
  assert(sharedReviewed(r,{[r.id]:sha256}));assert(!sharedReviewed(r,{}));
  const retired=await syncShared(first.recordings,[],get);assert(Object.values(retired.recordings)[0].source.retired);
});
test('invalid updates preserve cached missions; valid updates require new review',async()=>{
  const first=await syncShared({},[entry],async()=>JSON.stringify(record()));const old=Object.values(first.recordings)[0];
  const invalid=await syncShared(first.recordings,[entry],async()=>'{bad json');assert.equal(invalid.errors.length,1);assert.equal(Object.values(invalid.recordings)[0].source.hash,old.source.hash);
  const next=await syncShared(first.recordings,[entry],async()=>JSON.stringify({...record(),notes:'new version'}));const fresh=Object.values(next.recordings)[0];assert.equal(next.updated,1);assert(!sharedReviewed(fresh,{[old.id]:old.source.hash}));
  const mismatched=await syncShared(first.recordings,[{...entry,sha256:'0'.repeat(64)}],async()=>JSON.stringify(record()));assert.match(mismatched.errors[0],/checksum/);
});
test('share requires explicit review and timing; URL contains no recording payload or source metadata',()=>{
  const r={...record(),id:'local',source:{hash:'private metadata'},notes:'Private note to be in reviewed file only'};
  assert.throws(()=>prepareShare(r,false),/sharing box/);
  const share=prepareShare(r,true);const url=new URL(share.url);
  assert.equal(url.origin,'https://github.com');assert.equal(url.pathname,'/MonicaLittleWorlds/smallverse-recorder/issues/new');assert(url.searchParams.get('body').includes('Attach the JSON'));
  assert(!share.url.includes('Private'));assert(!share.url.includes('private%20metadata'));assert.equal(share.recording.source,undefined);assert.equal(share.recording.id,undefined);assert(share.url.length<4000);
  const bad=record();bad.timingReviewed=false;assert.throws(()=>prepareShare(bad,true),/timer/);
});
test('bounded downloads reject oversized bodies and failed responses',async()=>{
  assert.equal(await readBounded(new Response('hello'),10),'hello');
  await assert.rejects(readBounded(new Response('too much content'),3),/size limit/);
  await assert.rejects(readBounded(new Response('failure',{status:500}),100),/HTTP 500/);
});
