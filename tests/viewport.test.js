import test from 'node:test';import assert from 'node:assert/strict';
import {sameViewport,playbackViewport,centeredPoint,pointInside} from '../extension/viewport.js';
import {waitForHoverIdentity} from '../extension/hover.js';
test('viewport changes produce only a candidate, preserving the world-center offset',()=>{
 const old={width:1440,height:757},current={width:1470,height:956};
 assert.deepEqual(centeredPoint({x:699,y:367},old,current),{x:714,y:466.5});assert(!sameViewport(old,current));
 assert.deepEqual(playbackViewport({recording:{viewport:old},playbackViewport:current}),current);
 assert(!pointInside({x:1470,y:500},current));assert(pointInside({x:1469,y:955},current));
});
test('a shifted hidden-target candidate cannot authorize a click without the correct label',async()=>{
 const cp={title:'Door',text:'Go outside'},step={x:714,y:466.5,checkpoint:cp,hoverIdentity:{title:'White Door',text:'A white wooden door.'}},moves=[];
 await assert.rejects(waitForHoverIdentity(step,{probe:async()=>({checkpoint:cp}),read:async()=>({matches:false}),move:async p=>moves.push(p),sleep:async()=>{}}),/did not reveal/);
 assert.deepEqual(moves,[{x:20,y:20},{x:714,y:466.5}]);
});
