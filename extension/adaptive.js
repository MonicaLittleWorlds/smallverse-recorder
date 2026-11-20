import {matchPatch,checkpointEqual} from './core.js';
export function resizedPatch(p,scale){
 const width=Math.max(8,Math.round(p.width*scale)),height=Math.max(8,Math.round(p.height*scale)),data=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=Math.max(0,Math.min(p.width-1,(x+.5)*p.width/width-.5)),sy=Math.max(0,Math.min(p.height-1,(y+.5)*p.height/height-.5)),ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
  const at=(a,b)=>p.data[Math.min(p.height-1,b)*p.width+Math.min(p.width-1,a)];
  data.push(Math.round((at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy));
 }
 return {width,height,data,offsetX:p.offsetX*width/p.width,offsetY:p.offsetY*height/p.height};
}
export function adaptiveMatch(frame,patch){
 if(!patch)return null;
 const candidates=[];
 for(const scale of [.5,.625,.75,.875,1,1.125,1.25,1.375,1.5,1.625,1.75,1.875,2]){
  const p=resizedPatch(patch,scale),match=matchPatch(frame,p,{threshold:12,margin:4,includeAlternative:true});
  if(!match)continue;
  candidates.push({...match,scale});if(match.alternative)candidates.push({...match.alternative,scale});
 }
 candidates.sort((a,b)=>a.score-b.score);const best=candidates[0];if(!best||best.score>10)return null;
 const other=candidates.find(p=>Math.hypot(p.x-best.x,p.y-best.y)>Math.max(6,Math.min(patch.width,patch.height)*best.scale*.35));
 if(other&&other.score-best.score<4)return null;
 return {x:best.x*frame.scaleX,y:best.y*frame.scaleY,scale:best.scale,score:best.score};
}
// Measure motion in the rendered world, excluding UI rectangles reported by the page.
export function sceneStill(a,b,view={}){
 if(!a||a.width!==b.width||a.height!==b.height)return false;
 const region=view.region||{x:0,y:0,width:b.width*b.scaleX,height:b.height*b.scaleY},excluded=view.exclude||[];
 let samples=0,changed=0,detail=0;
 for(let y=2;y<b.height-2;y+=2)for(let x=2;x<b.width-2;x+=2){
  const cx=x*b.scaleX,cy=y*b.scaleY;
  if(cx<region.x||cy<region.y||cx>=region.x+region.width||cy>=region.y+region.height||excluded.some(r=>cx>=r.x&&cy>=r.y&&cx<r.x+r.width&&cy<r.y+r.height))continue;
  const i=y*b.width+x;samples++;
  if(Math.abs(a.data[i]-b.data[i])>10)changed++;
  if(Math.abs(b.data[i]-b.data[i-1])+Math.abs(b.data[i]-b.data[i-b.width])>12)detail++;
 }
 // Low-detail/black views cannot establish that movement has finished.
 return samples>=500&&detail>=40&&changed<=Math.max(3,samples*.0003);
}
// Learn only a small stationary animation footprint. A moving avatar/camera
// introduces changes outside that footprint, restarting the observation window.
// This remains a visual heuristic; target/objective checks still follow it.
export function localizedAnimationsSettled(frames,view={}){
 if(frames.length<8)return false;
 const first=frames[0],last=frames.at(-1);
 if(!frames.every(f=>f.width===first.width&&f.height===first.height&&f.scaleX===first.scaleX&&f.scaleY===first.scaleY))return false;
 if(!sceneStill(last,last,view))return false;
 const region=view.region||{x:0,y:0,width:last.width*last.scaleX,height:last.height*last.scaleY},excluded=view.exclude||[];
 const valid=[],footprint=new Set();
 for(let y=2;y<last.height-2;y+=2)for(let x=2;x<last.width-2;x+=2){
  const cx=x*last.scaleX,cy=y*last.scaleY;
  if(cx<region.x||cy<region.y||cx>=region.x+region.width||cy>=region.y+region.height||excluded.some(r=>cx>=r.x&&cy>=r.y&&cx<r.x+r.width&&cy<r.y+r.height))continue;
  const i=y*last.width+x;valid.push(i);
  for(let k=1;k<=3;k++)if(Math.abs(frames[k].data[i]-frames[k-1].data[i])>10){footprint.add(i);break;}
 }
 if(!footprint.size||footprint.size>valid.length*.02)return false;
 // No expanding mask: even slow translation must wait. Compare later frames
 // to the initial frame as well to catch accumulated sub-threshold drift.
 for(let k=4;k<frames.length;k++){
  let outside=0;
  for(const i of valid)if(!footprint.has(i)&&(Math.abs(frames[k].data[i]-frames[k-1].data[i])>10||Math.abs(frames[k].data[i]-first.data[i])>10))outside++;
  if(outside>2)return false;
 }
 return true;
}
export async function waitForMotion({probe,capture,sleep,maxFrames=60}){
 let previous=null,stable=0;const history=[];
 for(let i=0;i<maxFrames;i++){
  const state=await probe(),frame=await capture();await probe();
  stable=sceneStill(previous,frame,state.motionView)?stable+1:0;previous=frame;
  history.push(frame);if(history.length>8)history.shift();
  if(stable>=3||localizedAnimationsSettled(history,state.motionView))return;
  await sleep(100);
 }
 throw Error('Walking or camera motion has not settled visibly. Playback paused; no next action was sent.');
}
export async function stableAdaptiveTarget(step,{probe,capture,resolve,sleep}){
 let previous=null;
 for(let i=0;i<8;i++){
  const state=await probe();
  if(step.checkpoint?.title&&!checkpointEqual(step.checkpoint,state.checkpoint))throw Error('Objective changed while locating the next target.');
  const found=step.target?await resolve(step.target):adaptiveMatch(await capture(),step.patch);
  const after=await probe();if(step.checkpoint?.title&&!checkpointEqual(step.checkpoint,after.checkpoint))throw Error('Objective changed while locating the next target.');
  if(found&&previous&&Math.hypot(found.x-previous.x,found.y-previous.y)<=2&&Math.abs((found.scale||1)-(previous.scale||1))<=.125)return found;
  previous=found;await sleep(180);
 }
 throw Error('The next target could not be located uniquely and steadily after camera movement. Playback paused without clicking.');
}
export function startsMovement(step){
 if(step.type==='wheel')return true;
 if(step.type!=='pointerdown')return false;
 if(!step.target)return true;
 return /\b(walk\s*(to|towards)|zoom|rotate view)\b/i.test([step.target.aria,step.target.title,step.target.text].join(' '));
}
