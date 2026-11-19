import {PUBLISHER_URL} from './publisher-config.js';
const ROOT='https://github.com/MonicaLittleWorlds/smallverse-recorder/releases/';
export function versionParts(value){if(typeof value!=='string'||!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(value))throw Error('Invalid release version.');return value.split('.').map(Number);}
export function newerVersion(latest,installed){const a=versionParts(latest),b=versionParts(installed);for(let i=0;i<4;i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0);}return false;}
export function releaseInfo(release){
  if(release.draft||release.prerelease||!release.published_at)throw Error('Release is not published and stable.');
  const version=String(release.tag_name||'').replace(/^v/,'');versionParts(version);
  const tag=release.tag_name;if(tag!=='v'+version&&tag!==version)throw Error('Invalid release tag.');
  const expected=ROOT+'download/'+tag+'/smallverse-recorder-v'+version+'.zip';
  if(!release.assets?.some(a=>a.browser_download_url===expected))throw Error('Release download missing.');
  return {version,downloadURL:expected,releaseURL:ROOT+'tag/'+tag};
}
export function validatedUpdate(value){
  versionParts(value?.version);
  const tag=value.releaseURL?.slice((ROOT+'tag/').length);
  if(![value.version,'v'+value.version].includes(tag)||value.releaseURL!==ROOT+'tag/'+tag||value.downloadURL!==ROOT+'download/'+tag+'/smallverse-recorder-v'+value.version+'.zip')throw Error('Invalid release download.');
  return {version:value.version,downloadURL:value.downloadURL,releaseURL:value.releaseURL};
}
let checking;
export async function checkForUpdates(){
  if(checking)return checking;
  checking=(async()=>{
    const previous=(await chrome.storage.local.get('extensionUpdate')).extensionUpdate||{};
    if(Date.now()-(previous.checkedAt||0)<6*60*60*1000)return previous;
    try{
      const response=await fetch(PUBLISHER_URL+'/releases/latest',{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Update check unavailable.');
      const latest=validatedUpdate(await response.json()),state={...latest,checkedAt:Date.now()};
      await chrome.storage.local.set({extensionUpdate:state});return state;
    }catch{
      const state={...previous,checkedAt:Date.now()-5*60*60*1000};
      await chrome.storage.local.set({extensionUpdate:state});return state;
    }
  })().finally(()=>{checking=null;});return checking;
}
