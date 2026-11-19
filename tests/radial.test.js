import test from 'node:test';import assert from 'node:assert/strict';
import {waitForRadialControl} from '../extension/radial.js';
const cp={title:'Last task',text:'Use the car'},step={checkpoint:cp,target:{tag:'button',text:'*'}};
const base={probe:async()=>({checkpoint:cp}),sleep:async()=>{},anchor:{x:600,y:330}};
test('radial wait handles delayed appearance and movement, then returns current coordinates',async()=>{
 const samples=[null,{x:500,y:250},{x:510,y:260},{x:520,y:270},{x:520,y:270}];let calls=0;
 const p=await waitForRadialControl(step,{...base,resolve:async()=>samples[calls++]});
 assert.deepEqual(p,{x:520,y:270});assert.equal(calls,5);
});
test('radial wait refuses missing, ambiguous, distant or changed-objective targets',async()=>{
 for(const result of [null,{x:100,y:100}])await assert.rejects(waitForRadialControl(step,{...base,resolve:async()=>result}),/uniquely visible/);
 await assert.rejects(waitForRadialControl(step,{...base,probe:async()=>({checkpoint:{title:'Wrong',text:''}}),resolve:async()=>({x:520,y:270})}),/Objective changed/);
});
test('radial wait propagates cancellation before any click is possible',async()=>{
 await assert.rejects(waitForRadialControl(step,{...base,probe:async()=>{throw Error('Cancelled');},resolve:async()=>({x:520,y:270})}),/Cancelled/);
});
