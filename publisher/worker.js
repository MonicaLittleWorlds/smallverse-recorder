import {latestRelease} from './releases.js';
import {publishingToken} from './app-auth.js';
import {publishMission} from './github.js';
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const un64=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(secret){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function sign(value,secret){const data=b64(enc.encode(JSON.stringify(value)));return data+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(data))));}
export async function verify(token,secret,type){
  try{const [data,sig,...rest]=token.split('.');if(rest.length||!await crypto.subtle.verify('HMAC',await key(secret),un64(sig),enc.encode(data)))throw Error();const value=JSON.parse(new TextDecoder().decode(un64(data)));if(value.type!==type||value.exp<=Date.now())throw Error();return value;}catch{throw Error('Sign-in expired or invalid. Connect GitHub again.');}
}
export function validRedirect(value){return /^https:\/\/[a-p]{32}\.chromiumapp\.org\/github$/.test(value);}
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Referrer-Policy':'no-referrer'}});
export async function handle(request,env,fetcher=fetch){
  const url=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
  if(url.pathname==='/releases/latest'&&request.method==='GET'){try{return json(await latestRelease(fetcher,env));}catch(error){console.error('Release check failed:',error.message);return json({error:'Release information temporarily unavailable.'},503);}}
  if(url.pathname==='/')return new Response('SmallVerse mission sharing service. Connect from the recorder to publish reviewed missions.',{headers:{'Content-Type':'text/plain'}});
  if(!env.OAUTH_CLIENT_ID||!env.OAUTH_CLIENT_SECRET||!(env.PUBLISH_TOKEN||(env.GITHUB_APP_ID&&env.GITHUB_INSTALLATION_ID&&env.GITHUB_APP_PRIVATE_KEY))||!env.SESSION_SECRET||env.SESSION_SECRET.length<32)return json({error:'The owner has not finished configuring GitHub sharing.'},503);
  const base=new URL(env.PUBLIC_URL);if(base.protocol!=='https:'||base.origin!==url.origin)return json({error:'Service URL mismatch.'},400);
  try{
    if(url.pathname==='/auth/start'&&request.method==='GET'){
      const redirect=url.searchParams.get('redirect'),nonce=url.searchParams.get('nonce');
      if(!validRedirect(redirect)||!/^[a-f0-9-]{36}$/.test(nonce||''))return json({error:'Invalid extension sign-in request.'},400);
      const csrf=crypto.randomUUID(),state=await sign({type:'state',redirect,nonce,csrf,exp:Date.now()+600000},env.SESSION_SECRET);
      const auth=new URL('https://github.com/login/oauth/authorize');auth.search=new URLSearchParams({client_id:env.OAUTH_CLIENT_ID,redirect_uri:base.origin+'/auth/callback',state,scope:''}).toString();
      return new Response(null,{status:302,headers:{Location:auth.href,'Set-Cookie':`sv_auth=${csrf}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=600`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    }
    if(url.pathname==='/auth/callback'&&request.method==='GET'){
      const state=await verify(url.searchParams.get('state')||'',env.SESSION_SECRET,'state');
      if(!validRedirect(state.redirect)||!request.headers.get('Cookie')?.split(';').some(c=>c.trim()===`sv_auth=${state.csrf}`))throw Error('Sign-in verification failed. Connect GitHub again.');
      if(!url.searchParams.get('code'))throw Error('GitHub sign-in was cancelled.');
      const exchange=await fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.OAUTH_CLIENT_ID,client_secret:env.OAUTH_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:base.origin+'/auth/callback'})});
      const oauth=await exchange.json();if(!exchange.ok||!oauth.access_token)throw Error('GitHub sign-in failed.');
      const identity=await fetcher('https://api.github.com/user',{headers:{Authorization:`Bearer ${oauth.access_token}`,Accept:'application/vnd.github+json','User-Agent':'SmallVerse-Recorder'}});
      const user=await identity.json();if(!identity.ok||!Number.isSafeInteger(user.id)||user.id<=0||!/^[-a-zA-Z0-9]+$/.test(user.login))throw Error('GitHub identity could not be verified.');
      const exp=Date.now()+7*86400000,token=await sign({type:'session',id:user.id,login:user.login,exp},env.SESSION_SECRET);
      const redirect=new URL(state.redirect);redirect.hash=new URLSearchParams({token,nonce:state.nonce,login:user.login,expires:String(exp)}).toString();
      return new Response(null,{status:302,headers:{Location:redirect.href,'Set-Cookie':'sv_auth=; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=0','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    }
    if(url.pathname==='/missions'&&request.method==='POST'){
      const user=await verify((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env.SESSION_SECRET,'session');
      if((env.BLOCKED_USERS||'').split(',').map(x=>x.trim()).includes(String(user.id)))return json({error:'Publishing is disabled for this account.'},403);
      if(Number(request.headers.get('Content-Length'))>1100000)return json({error:'Recording exceeds 1 MB sharing limit.'},413);
      const reader=request.body?.getReader();if(!reader)return json({error:'Missing recording.'},400);
      const chunks=[];let size=0;try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1100000){await reader.cancel();return json({error:'Recording exceeds 1 MB sharing limit.'},413);}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const body=JSON.parse(new TextDecoder().decode(bytes));
      return json(await publishMission(body.recording,body.reviewed,user,await publishingToken(env,fetcher),fetcher));
    }
    return json({error:'Not found.'},404);
  }catch(error){return json({error:error.message},400);}
}
export default {fetch:(request,env)=>handle(request,env)};
