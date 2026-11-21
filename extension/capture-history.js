// Frames stay in memory only. Never use an image whose capture overlaps or follows
// the action, even when decoding/message delivery completes in a different order.
export function choosePreActionFrame(frames,at,url,documentToken,maxAge=1400){
 const sameDocument=frames.filter(f=>f&&f.url===url&&(!documentToken||f.documentToken===documentToken));
 const before=sameDocument.filter(f=>(f.completedAt??f.at)<=at).sort((a,b)=>b.at-a.at);
 const frame=before[0];
 if(!frame)return {frame:null,reason:sameDocument.length?'capture-overlapped-action':'no-frame'};
 const age=at-frame.at,captureMs=Math.max(0,(frame.completedAt??frame.at)-frame.at);
 return age>=0&&age<maxAge?{frame,age,captureMs}:{frame:null,reason:'stale-frame',age,captureMs};
}
export function captureCoverage(steps){
 let total=0,images=0,unverified=0;
 for(const s of steps){if(!['pointerdown','wheel'].includes(s.type))continue;total++;if(s.patch)images++;else if(!s.target)unverified++;}
 return {total,images,unverified};
}
