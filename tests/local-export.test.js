import test from 'node:test';import assert from 'node:assert/strict';
import {exportForReview,missionTiming,validateRecording} from '../extension/core.js';
import {prepareShare} from '../extension/sharing.js';
const short={format:'smallverse-mission',version:3,name:'Capture test',startURL:'https://smallverse.app/space/test',viewport:{width:1440,height:757},minimumMs:180000,timingReviewed:false,steps:[{type:'pointerdown',at:100,x:20,y:30,visualUnavailable:true,visualIssue:'no-frame'}]};
test('reviewed short tests export unchanged actions without timer markers but cannot replay or publish',()=>{
 const exported=exportForReview(short,{reviewed:true});validateRecording(exported);assert.deepEqual(exported.steps,short.steps);assert.equal(exported.timingReviewed,false);
 assert.throws(()=>missionTiming(exported),/first objective/);assert.throws(()=>prepareShare(exported,true),/first objective/);
 assert.throws(()=>exportForReview(short),/review box/);
});
test('an accidentally checked timer review does not block local export or mutate the saved recording',()=>{
 const source={...short,timingReviewed:true};const exported=exportForReview(source,{reviewed:true});assert.equal(exported.timingReviewed,false);assert.equal(source.timingReviewed,true);
});
test('complete reviewed timing survives local export',()=>{
 const source={...short,timingReviewed:true,steps:[{type:'checkpoint',at:0,checkpoint:{title:'First',text:'Start'},missionStart:true},{...short.steps[0],completionGate:true}]};
 const exported=exportForReview(source,{reviewed:true});assert.equal(exported.timingReviewed,true);assert.equal(missionTiming(exported).minimumMs,180000);
});
