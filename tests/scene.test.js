import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneAligned} from '../extension/scene.js';
import {validateRecording,exportRecording} from '../extension/core.js';
function fixture(){
 const frame={width:400,height:200,scaleX:1,scaleY:1,data:new Uint8Array(80000)};
 const anchors=[[30,30],[150,100],[300,150]].map(([x,y],k)=>{const data=Array.from({length:576},(_,i)=>(i*37+(i%24)**2*11+k*19)%256);for(let j=0;j<24;j++)for(let i=0;i<24;i++)frame.data[(y-12+j)*400+x-12+i]=data[j*24+i];return {x,y,patch:{width:24,height:24,offsetX:12,offsetY:12,data}};});return {frame,anchors};
}
test('visible landmarks authorize alignment even when the click itself is black',()=>{
 const {frame,anchors}=fixture();assert(sceneAligned(frame,anchors));
 // Independent animation elsewhere has no effect.
 frame.data[190*400+350]=200;assert(sceneAligned(frame,anchors));
});
test('scene guard rejects missing landmarks, black frames and shifted cameras',()=>{
 const {frame,anchors}=fixture();assert(!sceneAligned({...frame,data:new Uint8Array(80000)},anchors));
 const shifted={...frame,data:new Uint8Array(80000)};for(let y=0;y<200;y++)for(let x=5;x<400;x++)shifted.data[y*400+x]=frame.data[y*400+x-5];assert(!sceneAligned(shifted,anchors));
 frame.data.fill(0,18*400,42*400);assert(!sceneAligned(frame,anchors));assert(!sceneAligned(frame,anchors.slice(0,2)));
});
test('scene repair survives export and requires spaced landmarks and an exact objective',()=>{
 const {anchors}=fixture();const r={format:'smallverse-mission',version:3,name:'Dark room',startURL:'https://smallverse.app/space/test',viewport:{width:400,height:200},steps:[{type:'pointerdown',at:0,x:200,y:100,checkpoint:{title:'8',text:'Lights out'},sceneAnchors:anchors}]};
 assert.deepEqual(exportRecording(validateRecording(r)).steps[0].sceneAnchors,anchors);
 for(const change of [s=>delete s.checkpoint,s=>s.sceneAnchors=[anchors[0],anchors[0],anchors[2]],s=>s.sceneAnchors[0].patch.data=[0],s=>s.target={tag:'button'}]){const copy=structuredClone(r);change(copy.steps[0]);assert.throws(()=>validateRecording(copy));}
});
