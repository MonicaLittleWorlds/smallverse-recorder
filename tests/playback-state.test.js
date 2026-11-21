import test from 'node:test';
import assert from 'node:assert/strict';
import {playbackProgress,restorePlayback,recoveryObjectives,verifyRecoveryObjective} from '../extension/playback-state.js';
const first={title:'[1]',text:'First task'},later={title:'[7]',text:'Open the gates'};
const r={format:'smallverse-mission',version:3,id:'saved',name:'Recovery test',startURL:'https://smallverse.app/space/test',viewport:{width:1440,height:757},minimumMs:180000,timingReviewed:true,steps:[
 {type:'checkpoint',at:0,checkpoint:first,missionStart:true},
 {type:'text',at:1,value:'earlier'},
 {type:'checkpoint',at:2,checkpoint:later},
 {type:'text',at:3,value:'bob, open the gates'},
 {type:'keydown',at:4,key:'Enter',code:'Enter',keyCode:13,completionGate:true},
 {type:'keyup',at:5,key:'Enter',code:'Enter',keyCode:13}
]};
test('durable progress restores paused at the exact next action with a conservative timer',()=>{
 const s={mode:'playing',recording:r,tabId:7,index:3,missionStarted:1000,heldKeys:new Map(),buttons:0,positionReplay:true};
 const saved=playbackProgress(s,61000),restored=restorePlayback(saved,r,9000);
 assert.equal(restored.index,3);assert.equal(restored.mode,'paused');assert.equal(restored.reconnect,true);assert.equal(restored.restartRequired,false);
 assert.equal(9000-restored.missionStarted,60000);assert.equal(playbackProgress(null),null);
 for(const change of [{inFlight:true},{buttons:1},{heldKeys:[{code:'Enter',key:'Enter'}]}])assert(restorePlayback({...saved,...change},r).restartRequired);
 assert.throws(()=>restorePlayback({...saved,index:99},r));
 assert.throws(()=>restorePlayback({...saved,id:'different'},r));
});
test('objective recovery uses complete matching text and excludes finishing actions',()=>{
 assert.deepEqual(recoveryObjectives(r).map(o=>o.index),[0,2]);
 assert.equal(verifyRecoveryObjective(r,2,later).index,2);
 assert.throws(()=>verifyRecoveryObjective(r,2,{title:'[7]',text:'Already completed'}));
 assert.throws(()=>verifyRecoveryObjective(r,3,later));
});
