import test from 'node:test';
import assert from 'node:assert/strict';
import {publishMission} from '../publisher/github.js';
import {handle,sign,verify,validRedirect} from '../publisher/worker.js';
const recording=()=>({format:'smallverse-mission',version:3,name:'Reviewed test',startURL:'https://smallverse.app/space/test',viewport:{width:1440,height:757},minimumMs:180000,timingReviewed:true,steps:[{type:'checkpoint',at:0,checkpoint:{title:'Start',text:'Accepted'},missionStart:true},{type:'pointerdown',at:1,x:10,y:10,button:'left',buttons:1,completionGate:true},{type:'pointerup',at:2,x:10,y:10,button:'left',buttons:0}]});
const user={id:123,login:'Player'},env={PUBLIC_URL:'https://sharing.example',OAUTH_CLIENT_ID:'client',OAUTH_CLIENT_SECRET:'oauth-secret',PUBLISH_TOKEN:'server-only',SESSION_SECRET:'test-only-session-secret-32-characters'};
function github({conflict=false}={}){
  let entries=[],trees=[],refs=[],attempt=0;
  const fetcher=async(url,options)=>{
    const body=options.body?JSON.parse(options.body):null;
    assert.equal(options.headers.Authorization,'Bearer server-only');
    if(url.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'head'+attempt}});
    if(url.includes('/git/commits/head'))return Response.json({tree:{sha:'base'+attempt}});
    if(url.includes('/contents/recordings/index.json'))return Response.json({encoding:'base64',content:btoa(JSON.stringify(entries))});
    if(url.endsWith('/git/trees')){trees.push(body);return Response.json({sha:'tree'});}
    if(url.endsWith('/git/commits'))return Response.json({sha:'commit'});
    if(url.endsWith('/git/refs/heads/main')){
      refs.push(body);attempt++;
      if(conflict&&attempt===1){entries.push({name:'Other contribution',path:'recordings/other.json',author:'Other',revision:'1'});return Response.json({}, {status:409});}
      entries=JSON.parse(trees.at(-1).tree.find(f=>f.path==='recordings/index.json').content);return Response.json({});
    }
    throw Error('Unexpected request '+url);
  };
  return {fetcher,trees,refs,get entries(){return entries;}};
}
test('publishes recording and catalog atomically, strips metadata and deduplicates retry',async()=>{
  const mock=github(),r={...recording(),privateMetadata:'not public',id:'local'};
  const result=await publishMission(r,true,user,env.PUBLISH_TOKEN,mock.fetcher);
  assert.match(result.path,/^recordings\/u123-[a-f0-9]{64}\.json$/);
  assert.equal(mock.trees[0].tree.length,2);assert(!mock.trees[0].tree[0].content.includes('privateMetadata'));
  assert.deepEqual(mock.refs,[{sha:'commit',force:false}]);assert.equal(mock.entries[0].author,'Player');
  assert((await publishMission(r,true,user,env.PUBLISH_TOKEN,mock.fetcher)).duplicate);assert.equal(mock.refs.length,1);
});
test('concurrent catalog update is preserved when retrying a non-fast-forward conflict',async()=>{
  const mock=github({conflict:true});await publishMission(recording(),true,user,env.PUBLISH_TOKEN,mock.fetcher);
  assert.equal(mock.refs.length,2);assert.equal(mock.entries.length,2);assert.equal(mock.entries[0].path,'recordings/other.json');assert(mock.refs.every(r=>r.force===false));
});
test('unreviewed and oversized uploads do not reach GitHub',async()=>{
  let calls=0;const fetcher=()=>{calls++;throw Error('Unexpected');};
  await assert.rejects(publishMission(recording(),false,user,env.PUBLISH_TOKEN,fetcher),/review/i);
  const r=recording();r.steps.splice(1,0,...Array.from({length:350},(_,i)=>({type:'checkpoint',at:0,checkpoint:{title:'Repeated',text:'x'.repeat(4000)}})));
  await assert.rejects(publishMission(r,true,user,env.PUBLISH_TOKEN,fetcher),/1 MB/);assert.equal(calls,0);
});
test('signed sessions reject tampering, wrong token purpose and expiry',async()=>{
  const token=await sign({type:'session',...user,exp:Date.now()+10000},env.SESSION_SECRET);
  assert.equal((await verify(token,env.SESSION_SECRET,'session')).id,123);
  await assert.rejects(verify(token+'x',env.SESSION_SECRET,'session'));
  await assert.rejects(verify(token,env.SESSION_SECRET,'state'));
  await assert.rejects(verify(await sign({type:'session',exp:1},env.SESSION_SECRET),env.SESSION_SECRET,'session'));
});
test('service refuses unauthenticated, blocked and oversized requests',async()=>{
  const post=(body,token,headers={})=>new Request(env.PUBLIC_URL+'/missions',{method:'POST',headers:{Authorization:'Bearer '+token,...headers},body});
  let calls=0;const fetcher=()=>{calls++;throw Error('Unexpected');};
  assert.equal((await handle(post('{}','invalid'),env,fetcher)).status,400);
  const token=await sign({type:'session',...user,exp:Date.now()+10000},env.SESSION_SECRET);
  assert.equal((await handle(post('{}',token),{...env,BLOCKED_USERS:'123'},fetcher)).status,403);
  assert.equal((await handle(post('x'.repeat(1100001),token),env,fetcher)).status,413);
  assert.equal(calls,0);
});
test('OAuth flow binds state to browser cookie and returns only service session to Chrome',async()=>{
  const redirect='https://'+'a'.repeat(32)+'.chromiumapp.org/github',nonce=crypto.randomUUID();
  assert(validRedirect(redirect));assert(!validRedirect('https://evil.example/github'));
  const start=await handle(new Request(env.PUBLIC_URL+'/auth/start?'+new URLSearchParams({redirect,nonce})),env);
  assert.equal(start.status,302);const authorize=new URL(start.headers.get('Location'));assert.equal(authorize.searchParams.get('scope'),'');
  const state=authorize.searchParams.get('state'),callback=env.PUBLIC_URL+'/auth/callback?'+new URLSearchParams({state,code:'one-time-code'});
  let calls=0;const fetcher=async(url,options)=>{calls++;if(url.includes('access_token'))return Response.json({access_token:'user-oauth-token'});assert.equal(options.headers.Authorization,'Bearer user-oauth-token');return Response.json(user);};
  assert.equal((await handle(new Request(callback),env,fetcher)).status,400);assert.equal(calls,0);
  const response=await handle(new Request(callback,{headers:{Cookie:start.headers.get('Set-Cookie').split(';')[0]}}),env,fetcher);
  assert.equal(response.status,302);const target=new URL(response.headers.get('Location')),data=new URLSearchParams(target.hash.slice(1));
  assert.equal(target.origin+target.pathname,redirect);assert.equal(data.get('nonce'),nonce);
  assert.equal((await verify(data.get('token'),env.SESSION_SECRET,'session')).id,123);
  assert(!response.headers.get('Location').includes(env.PUBLISH_TOKEN));assert(!response.headers.get('Location').includes('user-oauth-token'));
});
test('HTTP publish accepts authenticated reviewed recording; unconfigured service stays unavailable',async()=>{
  const mock=github(),token=await sign({type:'session',...user,exp:Date.now()+10000},env.SESSION_SECRET);
  const req=()=>new Request(env.PUBLIC_URL+'/missions',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({recording:recording(),reviewed:true})});
  assert.equal((await handle(req(),{},mock.fetcher)).status,503);
  const result=await handle(req(),env,mock.fetcher);assert.equal(result.status,200);assert.match((await result.json()).path,/u123-/);
});


test('daily account limit refuses a sixth distinct recording',async()=>{
  const mock=github();
  for(let i=0;i<5;i++)await publishMission({...recording(),notes:'Version '+i},true,user,env.PUBLISH_TOKEN,mock.fetcher);
  await assert.rejects(publishMission({...recording(),notes:'Sixth'},true,user,env.PUBLISH_TOKEN,mock.fetcher),/Daily limit/);
  assert.equal(mock.refs.length,5);
});
