import test from 'node:test';
import assert from 'node:assert/strict';
import {learnOptionalPopups,popupCandidate,popupDecision,runOptionalPopup} from '../extension/popups.js';
import {validateRecording,exportRecording,missionTiming} from '../extension/core.js';
const before={title:'Collect',text:'Find an item'},popup={title:'Task complete',text:'You found it.'},next={title:'Next task',text:'Go to the beach'};
const raw=()=>[
  {type:'checkpoint',at:0,checkpoint:before,missionStart:true},
  {type:'checkpoint',at:1,checkpoint:popup},
  {type:'pointerdown',at:2,x:10,y:20,button:'left',buttons:1,checkpoint:popup,target:{tag:'button',dialog:popup.title,text:'Continue'}},
  {type:'pointerup',at:3,x:10,y:20,button:'left',buttons:0},
  {type:'checkpoint',at:4,checkpoint:{title:'',text:''}},
  {type:'checkpoint',at:5,checkpoint:next},
  {type:'pointerdown',at:6,x:10,y:20,button:'left',buttons:1,completionGate:true},
  {type:'pointerup',at:7,x:10,y:20,button:'left',buttons:0}
];
const record=steps=>({format:'smallverse-mission',version:3,name:'Popup test',startURL:'https://smallverse.app/space/test',viewport:{width:1440,height:757},minimumMs:180000,timingReviewed:true,steps});
function harness(observations){let index=0,time=0;const clicks=[];return {clicks,options:{probe:async()=>observations[Math.min(index,observations.length-1)],resolve:async()=>({x:10,y:20}),click:async p=>{clicks.push(p);index++;},sleep:async ms=>{time+=ms;},now:()=>time,timeout:500}};}
test('learning collapses only the popup checkpoint and complete click; timer markers survive',()=>{
  const learned=learnOptionalPopups(raw());assert.equal(learned.length,5);assert.equal(learned[1].type,'optionalPopup');assert.deepEqual(learned[2].checkpoint,next);
  assert.deepEqual(missionTiming(record(learned)),{start:0,finish:3,minimumMs:180000});
  learned[1].originalSteps[0].privateMetadata="must not export";
  const exported=exportRecording(record(learned));assert.equal(exported.steps[1].originalSteps[0].privateMetadata,undefined);assert.equal(exported.version,3);assert.deepEqual(validateRecording(exported).steps[1].next,next);
  assert.deepEqual(learnOptionalPopups(learned),learned);
});
test('no optional classification for acceptance, purchases, drags, timer markers or incomplete transitions',()=>{
  for(const label of ['Accept this mission','Buy','Claim reward']){const steps=raw();steps[2].target.text=label;assert.equal(learnOptionalPopups(steps).length,steps.length);}
  for(const index of [1,2,3]){const steps=raw();steps[index].completionGate=true;assert.equal(learnOptionalPopups(steps).length,steps.length);}
  const drag=raw();drag[3].x=40;assert.equal(popupCandidate(drag,2),null);
  const incomplete=raw().slice(0,4);assert.equal(popupCandidate(incomplete,2),null);
});
test('unlabelled buttons need explicit review; Make required prevents re-learning',()=>{
  const steps=raw();delete steps[2].target.text;steps[2].target.index=0;
  assert.equal(popupCandidate(steps,2),null);assert(popupCandidate(steps,2,{allowUnlabelled:true}));
  const optional=learnOptionalPopups(raw())[1];const required=optional.originalSteps.map(s=>({...s,optionalDisabled:true}));
  assert.equal(learnOptionalPopups([raw()[0],...required,raw()[5]]).filter(s=>s.type==='optionalPopup').length,0);
});
test('popup present is dismissed once and the next objective is required',async()=>{
  const step=learnOptionalPopups(raw())[1],h=harness([{dialogs:[before,popup]},{dialogs:[next]}]);
  assert.equal(await runOptionalPopup(step,h.options),'dismissed');assert.equal(h.clicks.length,1);
});
test('popup absent skips directly to observed next objective without any click',async()=>{
  const step=learnOptionalPopups(raw())[1],h=harness([{dialogs:[next]}]);
  assert.equal(await runOptionalPopup(step,h.options),'skipped');assert.equal(h.clicks.length,0);
});
test('unknown dialogs and same-title changed text are never dismissed',async()=>{
  const step=learnOptionalPopups(raw())[1];
  for(const dialogs of [[{...popup,text:'Confirm a purchase'}],[next,{title:'Error',text:'Disconnected'}]]){
    const h=harness([{dialogs}]);await assert.rejects(runOptionalPopup(step,h.options),/Unfamiliar dialog/);assert.equal(h.clicks.length,0);
  }
});
test('next objective behind popup still requires its dismissal; stale previous objective is not success',()=>{
  const step=learnOptionalPopups(raw())[1];assert.equal(popupDecision(step,{dialogs:[popup,next]}),'dismiss');assert.equal(popupDecision(step,{dialogs:[before]}),'wait');assert.equal(popupDecision(step,{dialogs:[]}),'wait');
});
test('slow transitions do not repeatedly click; timeout retains clicked state across retry',async()=>{
  const step=learnOptionalPopups(raw())[1],h=harness([{dialogs:[popup]}]),state={};
  await assert.rejects(runOptionalPopup(step,{...h.options,state}),/next objective did not appear/);assert.equal(h.clicks.length,1);
  await assert.rejects(runOptionalPopup(step,{...h.options,state}),/next objective did not appear/);assert.equal(h.clicks.length,1);
});
test('popup disappearing during resolution does not click the old coordinates',async()=>{
  const step=learnOptionalPopups(raw())[1];let calls=0,clicked=false;
  assert.equal(await runOptionalPopup(step,{probe:async()=>({dialogs:[++calls===1?popup:next]}),resolve:async()=>({x:1,y:1}),click:async()=>{clicked=true;},sleep:async()=>{}}),'skipped');assert.equal(clicked,false);
});
test('cancellation from the playback gate interrupts without input',async()=>{
  const step=learnOptionalPopups(raw())[1];let clicked=false;
  await assert.rejects(runOptionalPopup(step,{probe:async()=>{throw Error('Cancelled');},resolve:async()=>({x:1,y:1}),click:async()=>{clicked=true;},sleep:async()=>{}}),/Cancelled/);assert.equal(clicked,false);
});
