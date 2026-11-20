import test from 'node:test';import assert from 'node:assert/strict';
import {resizedPatch,adaptiveMatch,sceneStill,waitForMotion,stableAdaptiveTarget,startsMovement} from '../extension/adaptive.js';
const patch={width:24,height:24,offsetX:10,offsetY:14,data:Array.from({length:576},(_,i)=>(i*47+(i%24)**2*31)%256)};
const frame=()=>({width:180,height:140,scaleX:2,scaleY:2,data:new Uint8Array(180*140).fill(20)});
function paint(f,p,x,y){for(let j=0;j<p.height;j++)for(let i=0;i<p.width;i++)f.data[(y+j)*f.width+x+i]=p.data[j*p.width+i];}
test('adaptive targets relocate after pan and zoom while preserving the scaled click offset',()=>{
 for(const scale of [.5,.75,1,1.25,1.5,2]){const f=frame(),p=resizedPatch(patch,scale);paint(f,p,70,50);const m=adaptiveMatch(f,patch);assert(m,'scale '+scale);assert(Math.abs(m.x-(70+p.offsetX)*2)<=2);assert(Math.abs(m.y-(50+p.offsetY)*2)<=2);}
});
test('adaptive targets reject repeated objects, missing objects and flat references',()=>{
 const f=frame();paint(f,patch,20,20);paint(f,patch,110,80);assert.equal(adaptiveMatch(f,patch),null);assert.equal(adaptiveMatch(frame(),patch),null);assert.equal(adaptiveMatch(f,{...patch,data:Array(576).fill(20)}),null);
});
function textured(){const f=frame();f.data=Uint8Array.from(f.data,(_,i)=>(i*7+(i%180)**2)%256);return f;}
test('scene settling detects player movement and camera changes, excludes masked UI, and rejects darkness',()=>{
 const a=textured(),b=structuredClone(a);assert(sceneStill(a,b));
 for(let y=40;y<70;y++)for(let x=40;x<70;x++)b.data[y*b.width+x]=255;
 assert(!sceneStill(a,b));assert(sceneStill(a,b,{exclude:[{x:80,y:80,width:60,height:60}]}));assert(!sceneStill(frame(),frame()));
});
test('walking waits through slow movement and requires three consecutive quiet intervals',async()=>{
 const a=textured(),moving=structuredClone(a);moving.data.fill(0,1000,4000);const seq=[a,moving,a,moving,a,a,a,a];let calls=0;
 await waitForMotion({probe:async()=>({}),capture:async()=>seq[calls++],sleep:async()=>{},maxFrames:10});assert.equal(calls,8);
 await assert.rejects(waitForMotion({probe:async()=>({}),capture:async()=>frame(),sleep:async()=>{},maxFrames:4}),/not settled/);
 await assert.rejects(waitForMotion({probe:async()=>{throw Error('Cancelled');}}),/Cancelled/);
});
test('named controls wait for stable current coordinates and never accept a changed objective',async()=>{
 const cp={title:'Task',text:'Walk there'},step={checkpoint:cp,target:{tag:'button',text:'Check'}};let i=0;const points=[null,{x:100,y:100},{x:120,y:100},{x:120,y:100}];
 const result=await stableAdaptiveTarget(step,{probe:async()=>({checkpoint:cp}),resolve:async()=>points[i++],sleep:async()=>{}});assert.deepEqual(result,{x:120,y:100});
 await assert.rejects(stableAdaptiveTarget(step,{probe:async()=>({checkpoint:{title:'Wrong',text:''}})}),/Objective changed/);
});
test('walking and camera actions trigger settling but chat and menu actions do not',()=>{
 assert(startsMovement({type:'pointerdown'}));assert(startsMovement({type:'wheel'}));
 assert(startsMovement({type:'pointerdown',target:{aria:'Walk To'}}));assert(startsMovement({type:'pointerdown',target:{title:'Zoom out'}}));
 assert(!startsMovement({type:'pointerdown',target:{text:'Check'}}));assert(!startsMovement({type:'text'}));
});
