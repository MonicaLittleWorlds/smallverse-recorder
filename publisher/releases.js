import {releaseInfo} from '../extension/updates.js';
let cached,pending;
export async function latestRelease(fetcher=fetch){
  if(cached&&cached.until>Date.now())return cached.value;
  if(pending)return pending;
  pending=(async()=>{
    const r=await fetcher('https://api.github.com/repos/MonicaLittleWorlds/smallverse-recorder/releases/latest',{headers:{Accept:'application/vnd.github+json','User-Agent':'SmallVerse-Recorder'},redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('Release lookup unavailable.');
    const value=releaseInfo(await r.json());cached={value,until:Date.now()+600000};return value;
  })().finally(()=>{pending=null;});return pending;
}
