import test from 'node:test';import assert from 'node:assert/strict';
import {waitForHoverIdentity} from '../extension/hover.js';
import {validateRecording,exportRecording} from '../extension/core.js';
const checkpoint={title:'8',text:'Lights out'},step={type:'pointerdown',at:0,x:699,y:367,checkpoint,hoverIdentity:{title:'White Door',text:'A white wooden door.'}};
const base={probe:async()=>({checkpoint}),sleep:async()=>{}};
test('hover checks a newly appearing exact label twice after moving to saved coordinates',async()=>{
 const samples=[true,false,false,true,true],moves=[];let i=0;
 await waitForHoverIdentity(step,{...base,read:async()=>({matches:samples[i++]}),move:async p=>moves.push(p)});
 assert.deepEqual(moves,[{x:20,y:20},{x:699,y:367}]);assert.equal(i,5);
});
test('hover refuses stale labels, absent labels, changed objectives and cancellation',async()=>{
 for(const matches of [true,false])await assert.rejects(waitForHoverIdentity(step,{...base,read:async()=>({matches}),move:async()=>{}}),matches?/fresh hover/:/did not reveal/);
 await assert.rejects(waitForHoverIdentity(step,{...base,probe:async()=>({checkpoint:{title:'9',text:'Elsewhere'}})}),/Objective changed/);
 await assert.rejects(waitForHoverIdentity(step,{...base,probe:async()=>{throw Error('Cancelled');}}),/Cancelled/);
});
test('hover identity is validated and preserved in exports',()=>{
 const r={format:'smallverse-mission',version:3,name:'Door',startURL:'https://smallverse.app/space/test',viewport:{width:1440,height:757},steps:[step]};
 assert.deepEqual(exportRecording(validateRecording(r)).steps[0].hoverIdentity,step.hoverIdentity);
 for(const change of [s=>delete s.checkpoint,s=>s.hoverIdentity.title='',s=>s.target={tag:'button'},s=>s.type='pointerup']){const c=structuredClone(r);change(c.steps[0]);assert.throws(()=>validateRecording(c));}
});
