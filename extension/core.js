export const FORMAT = 'smallverse-mission';
export const VERSION = 1;
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
  if (!r || r.format !== FORMAT || r.version !== VERSION) fail('Unsupported recording format.');
  if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 120) fail('Invalid mission name.');
  if (!gameURL(r.startURL)) fail('Recording must start on a SmallVerse space.');
  if (!r.viewport || !finite(r.viewport.width) || !finite(r.viewport.height) || r.viewport.width < 100 || r.viewport.height < 100 || r.viewport.width > 10000 || r.viewport.height > 10000) fail('Invalid viewport.');
  if (!Array.isArray(r.steps) || r.steps.length > MAX_STEPS) fail('Recording has too many steps.');
  let last = -1;
  for (const s of r.steps) {
    if (!s || !['pointerdown','pointerup','pointermove','wheel','keydown','keyup','text','checkpoint'].includes(s.type)) fail('Unsupported action.');
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
    if(s.clickCount!==undefined&&![1,2].includes(s.clickCount))fail('Invalid click count.');
    if(s.modifiers!==undefined&&(!Number.isInteger(s.modifiers)||s.modifiers<0||s.modifiers>15))fail('Invalid modifiers.');
    if (s.target && (typeof s.target !== 'object' || JSON.stringify(s.target).length > 6000)) fail('Invalid target.');
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
    for(const k of ['type','at','x','y','button','buttons','modifiers','deltaX','deltaY','key','code','keyCode','repeat','value','target','patch','checkpoint','url','visualUnavailable','clickCount']) if(s[k]!==undefined) out[k]=structuredClone(s[k]);
    return out;
  });
  const out={format:FORMAT,version:VERSION,name:clean(name).slice(0,120),startURL:recording.startURL,viewport:recording.viewport,notes:String(notes).slice(0,4000),steps};
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
