export const FORMAT = 'smallverse-mission';
export const VERSION = 3;
export const MINIMUM_MISSION_MS = 180000;
export const MAX_STEPS = 20000;
export const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
export function gameURL(url) {
  try { const u = new URL(url); return u.origin === 'https://smallverse.app' && u.pathname.startsWith('/space/'); } catch { return false; }
}
export function sameSpace(a, b) {
  if (!gameURL(a) || !gameURL(b)) return false;
  return new URL(a).pathname.split('/')[2] === new URL(b).pathname.split('/')[2];
}
export function checkpointEqual(a, b) { return clean(a?.title) === clean(b?.title) && clean(a?.text) === clean(b?.text); }
const finite = n => typeof n === 'number' && Number.isFinite(n);
export function validateRecording(r) {
  const fail = message => { throw new Error(message); };
  if (!r || r.format !== FORMAT || ![1, 2, VERSION].includes(r.version)) fail('Unsupported recording format.');
  if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 120) fail('Invalid mission name.');
  if (!gameURL(r.startURL)) fail('Recording must start on a SmallVerse space.');
  if (!r.viewport || !finite(r.viewport.width) || !finite(r.viewport.height) || r.viewport.width < 100 || r.viewport.height < 100 || r.viewport.width > 10000 || r.viewport.height > 10000) fail('Invalid viewport.');
  if (!Array.isArray(r.steps) || r.steps.length > MAX_STEPS) fail('Recording has too many steps.');
  if(r.minimumMs!==undefined && (!Number.isInteger(r.minimumMs)||r.minimumMs<MINIMUM_MISSION_MS||r.minimumMs>3600000))fail('Minimum mission time must be between 3 and 60 minutes.');
  let last = -1;
  for (const s of r.steps) {
    if (!s || !['pointerdown','pointerup','pointermove','wheel','keydown','keyup','text','checkpoint','optionalPopup'].includes(s.type)) fail('Unsupported action.');
    if (!finite(s.at) || s.at < last || s.at > 86400000) fail('Invalid action time.');
    last = s.at;
    if (s.url && !gameURL(s.url)) fail('Action outside SmallVerse.');
    if (s.type.startsWith('pointer') || s.type === 'wheel') {
      if (![s.x,s.y].every(finite) || s.x < 0 || s.y < 0 || s.x > r.viewport.width || s.y > r.viewport.height) fail('Invalid pointer coordinates.');
      if (s.button !== undefined && !['left','right','middle','none'].includes(s.button)) fail('Unsupported mouse button.');
    }
    if (s.type === 'wheel' && ![s.deltaX,s.deltaY].every(n => finite(n) && Math.abs(n) <= 100000)) fail('Invalid wheel delta.');
    if (s.type === 'text' && (typeof s.value !== 'string' || s.value.length > 10000)) fail('Text exceeds limit.');
    if (s.type === 'keydown' || s.type === 'keyup') {
      if (typeof s.key !== 'string' || s.key.length > 40 || typeof s.code !== 'string' || s.code.length > 40 || !Number.isInteger(s.keyCode) || s.keyCode < 0 || s.keyCode > 255) fail('Invalid key.');
      if ((s.modifiers ?? 0) & 6) fail('System shortcuts are not supported.');
    }
    if (s.checkpoint && (typeof s.checkpoint.title !== 'string' || typeof s.checkpoint.text !== 'string' || s.checkpoint.title.length > 500 || s.checkpoint.text.length > 4000)) fail('Invalid checkpoint.');
    for(const flag of ['missionStart','completionGate','optionalDisabled'])if(s[flag]!==undefined&&typeof s[flag]!=='boolean')fail('Invalid timing marker.');
    if(s.waitForRadial!==undefined&&(s.waitForRadial!==true||s.type!=='pointerdown'||s.target?.tag!=='button'||s.target?.dialog||![s.target?.aria,s.target?.title,s.target?.text].some(v=>v==='*')))fail('Invalid radial button wait.');
    if(s.clickCount!==undefined&&![1,2].includes(s.clickCount))fail('Invalid click count.');
    if(s.modifiers!==undefined&&(!Number.isInteger(s.modifiers)||s.modifiers<0||s.modifiers>15))fail('Invalid modifiers.');
    if (s.target && (typeof s.target !== 'object' || JSON.stringify(s.target).length > 6000)) fail('Invalid target.');
    if(s.type==='optionalPopup'){
      if(s.missionStart||s.completionGate)fail('Timing markers cannot be inside an optional popup.');
      for(const cp of [s.popup,s.next,...(s.previous?[s.previous]:[])])if(!cp||typeof cp.title!=='string'||!clean(cp.title)||cp.title.length>500||typeof cp.text!=='string'||cp.text.length>4000)fail('Invalid optional popup checkpoint.');
      if(checkpointEqual(s.popup,s.next))fail('Optional popup must lead to a distinct objective.');
      if(!s.target||s.target.dialog!==s.popup.title||s.target.dialogText!==s.popup.text||!['button','a'].includes(s.target.tag))fail('Optional popup needs an exact dialog-scoped target.');
      const label=clean(s.target.aria||s.target.text||s.target.title);
      if(!/^(continue|ok|okay)$/i.test(label)&&!(!label&&Number.isInteger(s.target.index)&&s.target.index>=0))fail('Only recorded Continue/OK or reviewed unlabeled dismiss buttons can be optional.');
      if(s.originalSteps){
        if(!Array.isArray(s.originalSteps)||s.originalSteps.length>100||s.originalSteps.some(x=>x.type==='optionalPopup'||x.missionStart||x.completionGate))fail('Invalid original popup steps.');
        validateRecording({...r,steps:s.originalSteps});
      }
    }
    if (s.patch) {
      const p=s.patch;
      if (!Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width < 8 || p.height < 8 || p.width > 64 || p.height > 64 || !Array.isArray(p.data) || p.data.length !== p.width*p.height || !p.data.every(n=>Number.isInteger(n)&&n>=0&&n<=255) || !finite(p.offsetX) || !finite(p.offsetY)) fail('Invalid visual target.');
    }
  }
  if (JSON.stringify(r).length > 25000000) fail('Recording exceeds 25 MB.');
  return r;
}
// Public exports use an explicit schema: local IDs, logs and full screenshots never leave storage.
export function exportRecording(recording, {name=recording.name, notes='', omitText=false}={}) {
  const steps = recording.steps.filter(s => !omitText || s.type !== 'text').map(s => {
    const out={};
    for(const k of ['type','at','x','y','button','buttons','modifiers','deltaX','deltaY','key','code','keyCode','repeat','value','target','patch','checkpoint','url','visualUnavailable','clickCount','missionStart','completionGate','optionalDisabled','popup','next','previous','originalSteps','waitForRadial']) if(s[k]!==undefined) out[k]=structuredClone(s[k]);
    if(s.originalSteps)out.originalSteps=exportRecording({...recording,steps:s.originalSteps},{omitText}).steps;
    return out;
  });
  const out={format:FORMAT,version:VERSION,name:clean(name).slice(0,120),startURL:recording.startURL,viewport:recording.viewport,notes:String(notes).slice(0,4000),minimumMs:recording.minimumMs||MINIMUM_MISSION_MS,timingReviewed:!!recording.timingReviewed,steps};
  validateRecording(out); return out;
}
// Match a small grayscale target, rejecting low detail and ambiguous repeated patterns.
export function matchPatch(frame, patch, {threshold=17, margin=3}={}) {
  const {width:w,height:h,data}=frame, pw=patch.width, ph=patch.height;
  if(w<pw || h<ph) return null;
  const avg=patch.data.reduce((a,b)=>a+b,0)/patch.data.length;
  const variance=patch.data.reduce((a,b)=>a+(b-avg)**2,0)/patch.data.length;
  if(variance<70) return null;
  const error=(x,y,stride=2,cutoff=Infinity)=>{
    let sum=0,count=0;
    for(let j=0;j<ph;j+=stride) for(let i=0;i<pw;i+=stride){sum+=Math.abs(data[(y+j)*w+x+i]-patch.data[j*pw+i]); count++; if(sum>cutoff*Math.ceil(ph/stride)*Math.ceil(pw/stride))return Infinity;}
    return sum/count;
  };
  const candidates=[];
  for(let y=0;y<=h-ph;y++) for(let x=0;x<=w-pw;x++){const score=error(x,y,4,threshold+12);if(score<threshold+12)candidates.push({x,y,score});}
  candidates.sort((a,b)=>a.score-b.score);
  const regions=[];
  for(const c of candidates){if(regions.every(r=>Math.hypot(c.x-r.x,c.y-r.y)>Math.max(pw,ph)*.65))regions.push(c);if(regions.length===30)break;}
  const refined=[];
  for(const c of regions) for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
    const x=c.x+dx,y=c.y+dy;
    if(x>=0&&y>=0&&x<=w-pw&&y<=h-ph) refined.push({x,y,score:error(x,y,2,threshold+5)});
  }
  refined.sort((a,b)=>a.score-b.score);
  const best=refined[0]; if(!best || best.score>threshold)return null;
  const alternative=refined.find(c=>Math.hypot(c.x-best.x,c.y-best.y)>Math.max(pw,ph)*0.65);
  if(alternative && alternative.score-best.score<margin)return null;
  return {x:best.x+patch.offsetX,y:best.y+patch.offsetY,score:best.score};
}

// Markers live on steps, so removing a step cannot silently shift the safety boundary.
export function timingCandidates(steps) {
  const starts=[], finishes=[];let buttons=0;const keys=new Set();
  steps.forEach((step,index)=>{
    if(!buttons&&!keys.size&&['pointerdown','keydown','text','wheel'].includes(step.type))finishes.push(index);
    if(step.type==='pointerdown'||step.type==='pointerup')buttons=step.buttons??(step.type==='pointerdown'?1:0);
    if(step.type==='keydown')keys.add(step.code);
    if(step.type==='keyup')keys.delete(step.code);
    if(!buttons&&!keys.size&&step.type==='checkpoint'&&step.checkpoint?.title)starts.push(index);
  });
  return {starts,finishes};
}
export function missionTiming(recording) {
  const starts=recording.steps.flatMap((s,i)=>s.missionStart?[i]:[]);
  const finishes=recording.steps.flatMap((s,i)=>s.completionGate?[i]:[]);
  if(starts.length!==1||finishes.length!==1)throw Error('Review this mission: select its first objective and the action to hold before finishing.');
  const valid=timingCandidates(recording.steps);
  if(!valid.starts.includes(starts[0])||!valid.finishes.includes(finishes[0])||finishes[0]<=starts[0])throw Error('Timer markers are invalid. Start at an objective after acceptance; hold before a later complete input action.');
  if(recording.timingReviewed!==true)throw Error('Confirm the timer markers in Review before replay.');
  return {start:starts[0],finish:finishes[0],minimumMs:Math.max(MINIMUM_MISSION_MS,recording.minimumMs||0)};
}
export function remainingMissionMs(started, now, minimumMs=MINIMUM_MISSION_MS) {
  if(started===null||started===undefined)throw Error('The mission timer has not started.');
  return Math.max(0,minimumMs-Math.max(0,now-started));
}

// Verify the recorded point locally; never guess a new camera transform.
function wholePointMatches(frame,patch,x,y){
  if(!patch)return false;
  const left=Math.round(x/frame.scaleX-patch.offsetX),top=Math.round(y/frame.scaleY-patch.offsetY);
  if(left<0||top<0||left+patch.width>frame.width||top+patch.height>frame.height)return false;
  const mean=patch.data.reduce((a,b)=>a+b,0)/patch.data.length;
  const variance=patch.data.reduce((a,b)=>a+(b-mean)**2,0)/patch.data.length;
  // Faint details can identify a fixed point, but a flat patch cannot.
  if(variance<4)return false;
  const observed=[];
  let error=0;
  for(let j=0;j<patch.height;j++)for(let i=0;i<patch.width;i++){
    const value=frame.data[(top+j)*frame.width+left+i];observed.push(value);
    error+=Math.abs(value-patch.data[j*patch.width+i]);
  }
  if(variance>=70)return error/patch.data.length<=12;
  const observedMean=observed.reduce((a,b)=>a+b,0)/observed.length;
  let covariance=0,energy=0;
  observed.forEach((v,i)=>{covariance+=(v-observedMean)*(patch.data[i]-mean);energy+=(v-observedMean)**2;});
  const correlation=covariance/Math.sqrt(energy*variance*observed.length);
  return error/observed.length<=3 && correlation>=0.95 && energy/observed.length>=variance*0.7 && energy/observed.length<=variance*1.3;
}

export function sameWheelGesture(previous,step){
  return previous?.type==='wheel'&&step.type==='wheel'&&step.at>=previous.at&&step.at-previous.at<=180&&
    (step.modifiers||0)===(previous.modifiers||0)&&Math.hypot(step.x-previous.x,step.y-previous.y)<=4;
}

// Partial occlusion check: require multiple detailed regions at the original position.
// Changed tiles may be avatars, menus or animation; flat background is never evidence.
export function recordedPointMatches(frame,patch,x,y){
  if(wholePointMatches(frame,patch,x,y))return true;
  if(!patch||patch.width<16||patch.height<16)return false;
  const left=Math.round(x/frame.scaleX-patch.offsetX),top=Math.round(y/frame.scaleY-patch.offsetY);
  if(left<0||top<0||left+patch.width>frame.width||top+patch.height>frame.height)return false;
  const tiles=[];
  for(let ty=0;ty+8<=patch.height;ty+=8)for(let tx=0;tx+8<=patch.width;tx+=8){
    const data=[];for(let j=0;j<8;j++)for(let i=0;i<8;i++)data.push(patch.data[(ty+j)*patch.width+tx+i]);
    const mean=data.reduce((a,b)=>a+b,0)/64,variance=data.reduce((a,b)=>a+(b-mean)**2,0)/64;
    if(variance>=70)tiles.push({x:tx,y:ty,data,mean,variance});
  }
  function matches(tile,dx=0,dy=0){
    const ox=left+tile.x+dx,oy=top+tile.y+dy;
    if(ox<0||oy<0||ox+8>frame.width||oy+8>frame.height)return false;
    const data=[];for(let j=0;j<8;j++)for(let i=0;i<8;i++)data.push(frame.data[(oy+j)*frame.width+ox+i]);
    const mean=data.reduce((a,b)=>a+b,0)/64;
    let error=0,energy=0,covariance=0;
    data.forEach((v,i)=>{error+=Math.abs(v-tile.data[i]);energy+=(v-mean)**2;covariance+=(v-mean)*(tile.data[i]-tile.mean);});
    return error/64<=8&&energy>0&&covariance/Math.sqrt(energy*tile.variance*64)>=0.92;
  }
  const stable=tiles.filter(t=>matches(t)),required=Math.max(4,Math.ceil(Math.floor(patch.width/8)*Math.floor(patch.height/8)*0.25));
  if(stable.length<required)return false;
  if(new Set(stable.map(t=>t.x)).size<2||new Set(stable.map(t=>t.y)).size<2)return false;
  if(!stable.some(t=>Math.hypot(t.x+4-patch.offsetX,t.y+4-patch.offsetY)<=16))return false;
  // Repeated stripes/grids cannot prove alignment. Do not relocate the click.
  for(let dy=-8;dy<=8;dy+=2)for(let dx=-8;dx<=8;dx+=2){
    if(Math.hypot(dx,dy)<4)continue;
    if(stable.every(t=>matches(t,dx,dy)))return false;
  }
  return true;
}
