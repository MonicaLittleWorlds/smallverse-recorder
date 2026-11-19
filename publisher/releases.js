import {publishingToken} from './app-auth.js';
import {releaseInfo} from '../extension/updates.js';
let cached,pending;
export async function latestRelease(fetcher=fetch,env={}){
  if(cached&&cached.until>Date.now())return cached.value;
  if(pending)return pending;
  pending=(async()=>{
    const token=await publishingToken(env,fetcher);
    const r=await fetcher('https://api.github.com/repos/MonicaLittleWorlds/smallverse-recorder/releases/latest',{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'SmallVerse-Recorder'},redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('Release lookup unavailable.');
    const value=releaseInfo(await r.json());cached={value,until:Date.now()+600000};return value;
  })().finally(()=>{pending=null;});return pending;
}
