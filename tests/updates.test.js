import test from 'node:test';
import assert from 'node:assert/strict';
import {newerVersion,releaseInfo,validatedUpdate} from '../extension/updates.js';
const release={tag_name:'v0.6.8',published_at:'2026-11-19',draft:false,prerelease:false,assets:[{browser_download_url:'https://github.com/MonicaLittleWorlds/smallverse-recorder/releases/download/v0.6.8/smallverse-recorder-v0.6.8.zip'}]};
test('version comparison is numeric and ignores equal or older releases',()=>{assert(newerVersion('0.6.10','0.6.8'));assert(!newerVersion('0.6.8','0.6.8'));assert(!newerVersion('0.6.7','0.6.8'));assert.throws(()=>newerVersion('0.7.0-beta','0.6.8'));});
test('only stable published releases with repository ZIP links are offered',()=>{assert.equal(validatedUpdate(releaseInfo(release)).version,'0.6.8');for(const change of [{draft:true},{prerelease:true},{published_at:null},{assets:[]}])assert.throws(()=>releaseInfo({...release,...change}));assert.throws(()=>validatedUpdate({...releaseInfo(release),downloadURL:'https://evil.example/update.zip'}));});
test('update checks cache successes and preserve the notice offline',async()=>{
  const {checkForUpdates}=await import('../extension/updates.js');
  const originalFetch=globalThis.fetch;let stored={},calls=0;
  globalThis.chrome={storage:{local:{get:async()=>stored,set:async value=>{stored={...stored,...value};}}}};
  globalThis.fetch=async()=>{calls++;return Response.json(releaseInfo(release));};
  try{
    assert.equal((await checkForUpdates()).version,'0.6.8');
    await checkForUpdates();assert.equal(calls,1);
    stored.extensionUpdate.checkedAt=0;
    globalThis.fetch=async()=>{calls++;throw Error('offline');};
    assert.equal((await checkForUpdates()).version,'0.6.8');
    await checkForUpdates();assert.equal(calls,2);
  }finally{globalThis.fetch=originalFetch;delete globalThis.chrome;}
});
test('banner appears for a newer version and disappears after installing it',async()=>{
  const elements={updateBanner:{hidden:true},updateLabel:{},updateDownload:{},version:{}};let changed;
  globalThis.document={getElementById:id=>elements[id],querySelector:()=>elements.version};
  globalThis.chrome={runtime:{getManifest:()=>({version:'0.6.7'}),sendMessage:async()=>{}},storage:{local:{get:async()=>({extensionUpdate:releaseInfo(release)})},onChanged:{addListener:fn=>{changed=fn;}}}};
  try{
    await import('../extension/update-banner.js');
    assert.equal(elements.updateBanner.hidden,false);
    assert.equal(elements.updateDownload.href,releaseInfo(release).downloadURL);
    changed({extensionUpdate:{newValue:{...releaseInfo(release),version:'0.6.7',downloadURL:releaseInfo(release).downloadURL.replaceAll('0.6.8','0.6.7'),releaseURL:releaseInfo(release).releaseURL.replace('0.6.8','0.6.7')}}},'local');
    assert.equal(elements.updateBanner.hidden,true);
  }finally{delete globalThis.document;delete globalThis.chrome;}
});
test('public release service uses edge-compatible fetch and returns no credential',async()=>{
  const {latestRelease}=await import('../publisher/releases.js');
  const value=await latestRelease(async(url,options)=>{
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Authorization,'Bearer test-only');
    assert.equal(url,'https://api.github.com/repos/MonicaLittleWorlds/smallverse-recorder/releases/latest');
    return Response.json(release);
  },{PUBLISH_TOKEN:'test-only'});
  assert.deepEqual(value,releaseInfo(release));
  assert(!JSON.stringify(value).includes('test-only'));
});
