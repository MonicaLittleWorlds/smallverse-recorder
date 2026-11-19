import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify as verifySignature} from 'node:crypto';
import {createTokenProvider} from '../publisher/app-auth.js';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const env={GITHUB_APP_ID:'123',GITHUB_INSTALLATION_ID:'456',GITHUB_APP_PRIVATE_KEY:privateKey.export({type:'pkcs1',format:'pem'})};
test('app token uses signed JWT, repository-only permissions and refreshes before expiry',async()=>{
 const get=createTokenProvider(),now=Date.now();let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.github.com/app/installations/456/access_tokens');const [head,body,sig]=options.headers.Authorization.slice(7).split('.');assert(verifySignature('RSA-SHA256',Buffer.from(head+'.'+body),publicKey,Buffer.from(sig,'base64url')));const jwt=JSON.parse(Buffer.from(body,'base64url'));assert.equal(jwt.iss,'123');assert(jwt.exp-jwt.iat<=600);assert.deepEqual(JSON.parse(options.body),{repositories:['smallverse-recorder'],permissions:{contents:'write'}});return Response.json({token:'short-lived-'+calls,expires_at:new Date(now+calls*3600000).toISOString()});};
 assert.equal(await get(env,fetcher,now),'short-lived-1');assert.equal(await get(env,fetcher,now+1000),'short-lived-1');assert.equal(calls,1);
 assert.equal(await get(env,fetcher,now+3550000),'short-lived-2');assert.equal(calls,2);
});
test('concurrent requests share token generation; failed generation is retried',async()=>{
 const get=createTokenProvider();let calls=0;const fetcher=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return Response.json({token:'one',expires_at:new Date(Date.now()+3600000).toISOString()});};
 await Promise.all([get(env,fetcher),get(env,fetcher)]);assert.equal(calls,1);
 const retry=createTokenProvider();await assert.rejects(retry(env,async()=>new Response('',{status:401})),/401/);assert.equal(await retry(env,fetcher),'one');
});
test('partial app configuration fails closed; PAT remains supported during migration',async()=>{
 const get=createTokenProvider();assert.equal(await get({PUBLISH_TOKEN:'old'}),'old');await assert.rejects(get({GITHUB_APP_ID:'123',PUBLISH_TOKEN:'old'}),/incomplete/);
});
