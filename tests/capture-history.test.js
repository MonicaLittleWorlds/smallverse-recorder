import test from 'node:test';import assert from 'node:assert/strict';
import {choosePreActionFrame,captureCoverage} from '../extension/capture-history.js';
import {exportRecording,validateRecording} from '../extension/core.js';
const url='https://smallverse.app/space/test',make=(at,completedAt=at+50)=>({at,completedAt,url,documentToken:'one'});
test('delayed events retain their earlier pre-action image even after a newer frame arrives',()=>{
 const old=make(1000),fresh=make(1700);
 const chosen=choosePreActionFrame([old,fresh],1500,url,'one');assert.equal(chosen.frame,old);assert.equal(chosen.age,500);
});
test('overlapping, stale and different-document images never substitute for a missing reference',()=>{
 assert.equal(choosePreActionFrame([make(1000,1300)],1200,url,'one').reason,'capture-overlapped-action');
 assert.equal(choosePreActionFrame([make(1000)],2500,url,'one').reason,'stale-frame');
 assert.equal(choosePreActionFrame([make(1000)],1200,url,'other').reason,'no-frame');
 assert.equal(choosePreActionFrame([make(1000)],1200,url+'/other','one').reason,'no-frame');
});
test('coverage distinguishes missing images on named controls from unreplayable world clicks',()=>{
 assert.deepEqual(captureCoverage([{type:'pointerdown',patch:{}},{type:'pointerdown',target:{tag:'button'}},{type:'wheel'},{type:'pointerup'}]),{total:3,images:1,unverified:1});
 const r={format:'smallverse-mission',version:3,name:'test',startURL:url,viewport:{width:1440,height:757},steps:[{type:'pointerdown',at:0,x:10,y:20,visualUnavailable:true,visualIssue:'stale-frame',visualAgeMs:1600,documentToken:'private-local-token'}]};
 const exported=exportRecording(validateRecording(r));assert.equal(exported.steps[0].visualIssue,'stale-frame');assert.equal(exported.steps[0].visualAgeMs,1600);assert.equal(exported.steps[0].documentToken,undefined);
});
