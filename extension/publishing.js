import {PUBLISHER_URL} from './publisher-config.js';
import {prepareShare} from './sharing.js';
export function publisherURL(){
  if(!PUBLISHER_URL)throw Error('Automatic sharing is awaiting the owner’s hosting setup. Export JSON is still available.');
  const url=new URL(PUBLISHER_URL);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid publishing service configuration.');return url.origin;
}
export async function connectPublisher(){
  const base=publisherURL(),nonce=crypto.randomUUID(),redirect=chrome.identity.getRedirectURL('github');
  const url=new URL(base+'/auth/start');url.search=new URLSearchParams({redirect,nonce}).toString();
  const result=await chrome.identity.launchWebAuthFlow({url:url.href,interactive:true});
  if(!result)throw Error('GitHub sign-in was cancelled.');
  const returned=new URL(result);if(returned.origin+returned.pathname!==redirect)throw Error('Unexpected sign-in destination.');
  const data=new URLSearchParams(returned.hash.slice(1)),expires=Number(data.get('expires'));
  if(data.get('nonce')!==nonce||!data.get('token')||expires<=Date.now())throw Error('GitHub sign-in could not be verified.');
  await chrome.storage.session.set({publisherSession:{token:data.get('token'),login:data.get('login'),expires,base}});
  return {login:data.get('login')};
}
export async function publisherStatus(){const {publisherSession:s}=await chrome.storage.session.get('publisherSession');return {configured:!!PUBLISHER_URL,login:s&&s.expires>Date.now()?s.login:null};}
export async function publishRecording(recording,reviewed){
  const ready=prepareShare(recording,reviewed),base=publisherURL();
  let {publisherSession:s}=await chrome.storage.session.get('publisherSession');
  if(!s||s.expires<=Date.now()||s.base!==base){await connectPublisher();s=(await chrome.storage.session.get('publisherSession')).publisherSession;}
  const body=JSON.stringify({recording:ready.recording,reviewed:true});
  if(new TextEncoder().encode(body).length>1000000)throw Error('Recording is too large for automatic sharing (1 MB). Use Export JSON.');
  const response=await fetch(base+'/missions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.token}`},body,credentials:'omit',redirect:'error'});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Upload failed. Your local recording is unchanged.');return result;
}
