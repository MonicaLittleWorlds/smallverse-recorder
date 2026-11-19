import {prepareShare,validateCatalog,digest,REPOSITORY} from '../extension/sharing.js';
export async function publishMission(recording,reviewed,user,token,fetcher=fetch){
  const prepared=prepareShare(recording,reviewed),raw=JSON.stringify(prepared.recording)+'\n';
  if(new TextEncoder().encode(raw).length>1000000)throw Error('Automatic sharing supports recordings up to 1 MB. Export a larger recording for manual submission.');
  const hash=await digest(raw),path=`recordings/u${user.id}-${hash}.json`,root=`https://api.github.com/repos/${REPOSITORY}`;
  const api=async(endpoint,method='GET',body)=>{
    const response=await fetcher(root+endpoint,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'SmallVerse-Recorder','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});
    if(response.status>=300&&response.status<400)throw Error(`GitHub publishing refused an unexpected redirect (HTTP ${response.status}).`);
    if(!response.ok){const error=new Error(`GitHub publishing failed (HTTP ${response.status}).`);error.status=response.status;throw error;}
    return response.json();
  };
  for(let attempt=0;attempt<3;attempt++){
    const head=await api('/git/ref/heads/main'),commit=await api(`/git/commits/${head.object.sha}`);
    const file=await api(`/contents/recordings/index.json?ref=${head.object.sha}`);
    if(file.encoding!=='base64'||!file.content)throw Error('Shared catalog could not be read.');
    const catalog=validateCatalog(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0)))));
    if(catalog.some(e=>e.path===path))return {url:`https://github.com/${REPOSITORY}/blob/main/${path}`,path,duplicate:true};
    const today=new Date().toISOString().slice(0,10);
    if(catalog.filter(e=>e.path.startsWith(`recordings/u${user.id}-`)&&e.revision.startsWith(today)).length>=5)throw Error('Daily limit reached: five new recordings per GitHub account.');
    catalog.push({name:prepared.recording.name,path,author:user.login,revision:new Date().toISOString(),sha256:hash,description:'Community recording. Review starting instructions and actions before replay.'});
    validateCatalog(catalog);
    // Both files become visible in a single commit; never force-push concurrent changes.
    const tree=await api('/git/trees','POST',{base_tree:commit.tree.sha,tree:[{path,mode:'100644',type:'blob',content:raw},{path:'recordings/index.json',mode:'100644',type:'blob',content:JSON.stringify(catalog,null,2)+'\n'}]});
    const created=await api('/git/commits','POST',{message:`Share mission: ${prepared.recording.name}`,tree:tree.sha,parents:[head.object.sha]});
    try{await api('/git/refs/heads/main','PATCH',{sha:created.sha,force:false});return {url:`https://github.com/${REPOSITORY}/blob/main/${path}`,path,duplicate:false};}
    catch(error){if(![409,422].includes(error.status)||attempt===2)throw error;}
  }
}
