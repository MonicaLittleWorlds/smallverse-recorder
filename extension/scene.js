import {checkpointEqual} from './core.js';
// A reviewed hidden-target repair uses visible world landmarks, not black pixels.
export function sceneAligned(frame,anchors){
  if(!Array.isArray(anchors)||anchors.length!==3)return false;
  function score(a,dx=0,dy=0){
    const p=a.patch,left=Math.round(a.x/frame.scaleX-p.offsetX)+dx,top=Math.round(a.y/frame.scaleY-p.offsetY)+dy;
    if(left<0||top<0||left+p.width>frame.width||top+p.height>frame.height)return false;

    const values=[];for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)values.push(frame.data[(top+y)*frame.width+left+x]);
    // Normalize resampling noise from different screenshot pixel densities.
    // Compare the same interior pixels on both sides; never move the target.
    function smooth(data){const out=[];for(let y=1;y<p.height-1;y++)for(let x=1;x<p.width-1;x++){let sum=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)sum+=data[(y+j)*p.width+x+i]*(i===0?2:1)*(j===0?2:1);out.push(sum/16);}return out;}
    const reference=smooth(p.data),sample=smooth(values),n=sample.length;
    const mean=reference.reduce((s,v)=>s+v,0)/n,observed=sample.reduce((s,v)=>s+v,0)/n;
    let variance=0,energy=0,covariance=0,error=0;
    sample.forEach((v,i)=>{variance+=(reference[i]-mean)**2;energy+=(v-observed)**2;covariance+=(v-observed)*(reference[i]-mean);error+=Math.abs(v-reference[i]);});
    return variance/n>=9&&energy/n>=9&&error/n<=4&&covariance/Math.sqrt(variance*energy)>=.96;
  }
  if(!anchors.every(a=>score(a)))return false;
  // Reject repeated patterns that also fit a nearby displaced camera.
  for(let dy=-8;dy<=8;dy+=2)for(let dx=-8;dx<=8;dx+=2){
    if(Math.hypot(dx,dy)>=4&&anchors.every(a=>score(a,dx,dy)))return false;
  }
  return true;
}

export async function waitForScene(step,{probe,capture,sleep}){
  let consecutive=0;
  for(let attempt=0;attempt<10;attempt++){
    const before=await probe();
    if(!checkpointEqual(step.checkpoint,before.checkpoint))throw Error('Objective changed before the repaired door click.');
    const frame=await capture();
    const after=await probe();
    if(!checkpointEqual(step.checkpoint,after.checkpoint))throw Error('Objective changed before the repaired door click.');
    consecutive=sceneAligned(frame,step.sceneAnchors)?consecutive+1:0;
    if(consecutive>=2)return;
    await sleep(150);
  }
  throw Error('Visible scene landmarks do not match the repaired door position after 10 checks. Replay paused without clicking.');
}
