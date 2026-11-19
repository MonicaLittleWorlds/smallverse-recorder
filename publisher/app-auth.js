const encoder=new TextEncoder();
const b64=value=>btoa(String.fromCharCode(...value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const join=(...arrays)=>Uint8Array.from(arrays.flatMap(a=>Array.from(a)));
function der(tag,data){const n=data.length,bytes=[];for(let v=n;v;v>>>=8)bytes.unshift(v&255);return join([tag],n<128?[n]:[128|bytes.length,...bytes],data);}
export async function importAppKey(pem){
  const raw=Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0));
  // GitHub downloads PKCS#1; WebCrypto accepts the equivalent PKCS#8 wrapper.
  const bytes=pem.includes('BEGIN RSA PRIVATE KEY')?der(48,join([2,1,0],[48,13,6,9,42,134,72,134,247,13,1,1,1,5,0],der(4,raw))):raw;
  return crypto.subtle.importKey('pkcs8',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
}
export function createTokenProvider(){
  let cached=null,pending=null;
  return async function publishingToken(env,fetcher=fetch,now=Date.now()){
    if(!env.GITHUB_APP_ID&&!env.GITHUB_INSTALLATION_ID&&!env.GITHUB_APP_PRIVATE_KEY){if(env.PUBLISH_TOKEN)return env.PUBLISH_TOKEN;throw Error('Publishing credentials are not configured.');}
    if(!/^\d+$/.test(env.GITHUB_APP_ID||'')||!/^\d+$/.test(env.GITHUB_INSTALLATION_ID||'')||!env.GITHUB_APP_PRIVATE_KEY)throw Error('GitHub App configuration is incomplete.');
    const identity=env.GITHUB_APP_ID+':'+env.GITHUB_INSTALLATION_ID+':'+env.GITHUB_APP_PRIVATE_KEY;
    if(cached?.identity===identity&&cached.expires>now+60000)return cached.token;
    if(pending?.identity===identity)return pending.promise;
    const promise=(async()=>{
      const seconds=Math.floor(now/1000),header=b64(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'}))),payload=b64(encoder.encode(JSON.stringify({iat:seconds-60,exp:seconds+540,iss:env.GITHUB_APP_ID})));
      const data=header+'.'+payload,key=await importAppKey(env.GITHUB_APP_PRIVATE_KEY),signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(data));
      const response=await fetcher(`https://api.github.com/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${data}.${b64(new Uint8Array(signature))}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'SmallVerse-Recorder','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({repositories:['smallverse-recorder'],permissions:{contents:'write'}})});
      if(!response.ok)throw Error(`GitHub App authorization failed (HTTP ${response.status}).`);
      const result=await response.json(),expires=Date.parse(result.expires_at);
      if(typeof result.token!=='string'||!result.token||!Number.isFinite(expires)||expires<=now+60000)throw Error('GitHub returned an invalid installation token.');
      cached={identity,token:result.token,expires};return result.token;
    })();
    pending={identity,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=null;}
  };
}
export const publishingToken=createTokenProvider();
