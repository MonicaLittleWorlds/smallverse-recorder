// A reviewed hidden-target repair uses visible world landmarks, not black pixels.
export function sceneAligned(frame,anchors){
  if(!Array.isArray(anchors)||anchors.length!==3)return false;
  function score(a,dx=0,dy=0){
    const p=a.patch,left=Math.round(a.x/frame.scaleX-p.offsetX)+dx,top=Math.round(a.y/frame.scaleY-p.offsetY)+dy;
    if(left<0||top<0||left+p.width>frame.width||top+p.height>frame.height)return false;
    const n=p.data.length,mean=p.data.reduce((s,v)=>s+v,0)/n;
    const values=[];for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)values.push(frame.data[(top+y)*frame.width+left+x]);
    const observed=values.reduce((s,v)=>s+v,0)/n;
    let variance=0,energy=0,covariance=0,error=0;
    values.forEach((v,i)=>{variance+=(p.data[i]-mean)**2;energy+=(v-observed)**2;covariance+=(v-observed)*(p.data[i]-mean);error+=Math.abs(v-p.data[i]);});
    return variance/n>=9&&energy/n>=9&&error/n<=4&&covariance/Math.sqrt(variance*energy)>=.96;
  }
  if(!anchors.every(a=>score(a)))return false;
  // Reject repeated patterns that also fit a nearby displaced camera.
  for(let dy=-8;dy<=8;dy+=2)for(let dx=-8;dx<=8;dx+=2){
    if(Math.hypot(dx,dy)>=4&&anchors.every(a=>score(a,dx,dy)))return false;
  }
  return true;
}
