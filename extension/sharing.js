import {validateRecording,exportRecording,missionTiming} from './core.js';
export const REPOSITORY='MonicaLittleWorlds/smallverse-recorder';
export const RAW_ROOT=`https://raw.githubusercontent.com/${REPOSITORY}/main/`;
export const sharedId=path=>`shared:${path}`;
export function validateCatalog(value){
  if(!Array.isArray(value)||value.length>500)throw Error('Invalid shared catalog.');
  const seen=new Set();
  return value.map(entry=>{
    if(!entry||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>120||!/^recordings\/[a-zA-Z0-9_-]+\.json$/.test(entry.path)||entry.path==='recordings/index.json'||seen.has(entry.path))throw Error('Invalid or duplicate shared recording entry.');
    seen.add(entry.path);
    if(entry.sha256!==undefined&&!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid recording checksum.');
    return {name:entry.name,path:entry.path,description:String(entry.description||'').slice(0,1000),author:String(entry.author||'Community').slice(0,100),revision:String(entry.revision||'').slice(0,80),...(entry.sha256?{sha256:entry.sha256}:{})};
  });
}
export async function digest(text){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function readBounded(response,maxBytes){
  if(!response.ok)throw Error(`GitHub returned HTTP ${response.status}.`);
  if(Number(response.headers.get('content-length'))>maxBytes)throw Error('Shared file exceeds the size limit.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('Shared file exceeds the size limit.');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
// New shared data never writes to the local-recordings store or to review approvals.
export async function syncShared(previous,entries,download,now=new Date().toISOString()){
  const next=structuredClone(previous),errors=[];let added=0,updated=0,unchanged=0,totalBytes=0;
  const paths=new Set(entries.map(e=>e.path));
  for(const [id,r] of Object.entries(next))if(r.source&&!paths.has(r.source.path))next[id]={...r,source:{...r.source,retired:true}};
  for(const entry of entries){
    const id=sharedId(entry.path),old=previous[id];
    try{
      // Hashes are optional for legacy catalog entries. Checksum-bearing files need no repeat download.
      if(entry.sha256&&old?.source.hash===entry.sha256&&!old.source.retired){next[id]={...old,source:{...old.source,author:entry.author,revision:entry.revision,syncError:''}};unchanged++;continue;}
      const raw=await download(entry.path);totalBytes+=new TextEncoder().encode(raw).length;
      if(totalBytes>100000000)throw Error('Sync download budget exceeded.');
      const hash=await digest(raw);if(entry.sha256&&entry.sha256!==hash)throw Error('Recording checksum does not match the catalog.');
      const parsed=validateRecording(JSON.parse(raw));missionTiming(parsed);
      const record=exportRecording(parsed,{notes:parsed.notes||''});
      next[id]={...record,id,source:{path:entry.path,hash,author:entry.author,revision:entry.revision||hash.slice(0,8),downloadedAt:now,retired:false,syncError:''}};
      if(!old)added++;else if(old.source.hash!==hash)updated++;else unchanged++;
    }catch(error){
      errors.push(`${entry.name}: ${error.message}`);
      if(old)next[id]={...old,source:{...old.source,syncError:error.message,retired:false}};
      if(totalBytes>100000000)break;
    }
  }
  return {recordings:next,added,updated,unchanged,errors};
}
export function sharedReviewed(recording,reviews){return !recording.source||reviews?.[recording.id]===recording.source.hash;}
export function prepareShare(recording,reviewed){
  if(reviewed!==true)throw Error('Review the recording and check the public sharing box first.');
  validateRecording(recording);missionTiming(recording);
  const exported=exportRecording(recording,{notes:recording.notes||''});
  const filename=(exported.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'mission')+'.json';
  const body=[
    '## Shared mission submission',
    '',
    'Attach the JSON file downloaded by SmallVerse Recorder below before submitting.',
    '',
    `Recording: ${filename}`,
    `Steps: ${exported.steps.length}`,
    `Game view: ${exported.viewport.width} × ${exported.viewport.height}`,
    `Minimum completion time: ${exported.minimumMs/1000} seconds`,
    '',
    '- [x] I reviewed the text, visual targets and space URLs for public sharing.',
    '- [x] I reviewed the mission-start and completion-hold markers.',
    '- [ ] I successfully replayed this version in SmallVerse (check only if tested).',
    '',
    'The shared library updates after a maintainer adds this recording to the catalog.',
  ].join('\n');
  const url=new URL(`https://github.com/${REPOSITORY}/issues/new`);
  url.searchParams.set('title',`Shared mission: ${exported.name}`);url.searchParams.set('body',body);
  return {recording:exported,filename,url:url.href};
}
