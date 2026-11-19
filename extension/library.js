import {learnOptionalPopups,popupCandidate} from './popups.js';
import {exportRecording,validateRecording,timingCandidates,missionTiming} from './core.js';
const $=id=>document.getElementById(id);
async function request(kind,extra={}){const r=await chrome.runtime.sendMessage({kind,...extra});if(!r.ok)throw Error(r.error);return r.value;}
let current,reviewOriginal;
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn)=>{const b=node('button',text);b.onclick=()=>Promise.resolve().then(fn).catch(e=>$('error').textContent=e.message);return b;};
async function refresh(){
  const {recordings,sync}=await request('status');$('recordings').replaceChildren();$('shared').replaceChildren();
  const query=$('librarySearch').value.trim().toLocaleLowerCase();
  const matches=recordings.filter(r=>r.name.toLocaleLowerCase().includes(query));
  $('searchStatus').textContent=query?`${matches.length} matching mission${matches.length===1?'':'s'}`:'';
  for(const r of matches){
    const card=node('div');card.className='mission';const info=node('div');
    const origin=r.source?`${r.source.author} · ${r.source.revision}${r.source.retired?' · Withdrawn':r.reviewRequired?' · Review required':' · Reviewed'}`:`${r.count} steps · ${r.timingReviewed?'3:00 minimum set':'Timer setup needed'}`;
    info.append(node('h3',r.name),node('p',origin));if(r.source?.syncError)info.append(node('p','Update unavailable; cached version retained.'));
    card.append(info);const actions=node('div');actions.className='row';
    actions.append(button(r.source?'Review / Copy':'Review / Share',async()=>openReview(await request('get',{id:r.id}))));
    if(!r.source)actions.append(button('Delete',async()=>{if(confirm(`Delete ${r.name} from this browser? Export it first if you need a backup.`)){await request('delete',{id:r.id});await refresh();}}));
    card.append(actions);$(r.source?'shared':'recordings').append(card);
  }
  if(!matches.some(r=>r.source))$('shared').append(node('p',query?'No matching shared missions.':'No shared missions published yet.'));
  if(!matches.some(r=>!r.source))$('recordings').append(node('p',query?'No matching personal missions.':'No personal recordings saved yet.'));
  $('syncStatus').textContent=sync.error?`Sync unavailable: ${sync.error} Cached missions remain available.`:sync.lastSuccess?`Last synced ${new Date(sync.lastSuccess).toLocaleString()}.${sync.errors?.length?' '+sync.errors.length+' recording(s) could not update.':''}`:'Syncs automatically when opened and every 30 minutes while Chrome runs.';
}
function drawSteps(){
  $('summary').textContent=`${current.steps.length} steps · ${current.steps.filter(s=>s.type==='text').length} typed entries · ${current.steps.filter(s=>s.patch).length} visual targets · ${current.steps.filter(s=>s.type==='optionalPopup').length} optional popups`;
  $('steps').replaceChildren();
  current.steps.forEach((s,i)=>{
    const row=node('div');row.className='step'+(s.missionStart||s.completionGate?' marker':'');
    let details=s.type==='optionalPopup'?`Optional popup: ${s.popup.title}\n${s.popup.text}\nIf absent, require: ${s.next.title} — ${s.next.text}`:s.type==='text'?`Text: ${s.value}`:s.type==='checkpoint'?`Checkpoint: ${s.checkpoint.title}\n${s.checkpoint.text}`:s.type.startsWith('key')?`${s.type}: ${s.key}`:`${s.type}${s.target?' · '+(s.target.aria||s.target.title||s.target.text||s.target.tag):''}${s.x!==undefined?` · (${Math.round(s.x)}, ${Math.round(s.y)})`:''}`;
    row.append(node('span',`${i+1}. ${(s.at/1000).toFixed(1)}s · ${details}${s.missionStart?"\nTIMER STARTS AFTER THIS OBJECTIVE":""}${s.completionGate?"\nHOLD BEFORE THIS ACTION UNTIL 3:00":""}`));
    if(s.patch){const c=node('canvas');c.width=s.patch.width;c.height=s.patch.height;c.style.width='64px';c.style.height='64px';c.title='Visual target captured near this click';const ctx=c.getContext('2d'),data=ctx.createImageData(c.width,c.height);s.patch.data.forEach((v,j)=>{data.data.set([v,v,v,255],j*4);});ctx.putImageData(data,0,0);row.append(c);}
    if(s.type==='optionalPopup'&&s.originalSteps)row.append(button('Make required',()=>{current.steps.splice(i,1,...s.originalSteps.map(x=>({...x,optionalDisabled:true})));stepsChanged();}));
    else if(popupCandidate(current.steps,i,{allowUnlabelled:true}))row.append(button('Make optional',()=>{
      const candidate=popupCandidate(current.steps,i,{allowUnlabelled:true});
      if(!confirm('Does this button only dismiss the task popup? Do not mark mission acceptance, purchases, or finishing actions as optional.'))return;
      current.steps.splice(candidate.start,candidate.next-candidate.start,candidate.step);stepsChanged();
    }));
    row.append(button('Remove',()=>{current.steps.splice(i,1);stepsChanged();}));$('steps').append(row);
  });
}
function stepsChanged(){current.version=3;current.timingReviewed=false;$('timingReviewed').checked=false;$('reviewed').checked=false;drawSteps();drawTiming();}
$('detectPopups').onclick=()=>{const learned=learnOptionalPopups(current.steps);const before=current.steps.filter(s=>s.type==='optionalPopup').length;current.steps=learned;const added=learned.filter(s=>s.type==='optionalPopup').length-before;if(added)stepsChanged();$('reviewError').textContent=added?`${added} optional popup(s) detected. Review them and reconfirm timing markers.`:'No additional complete Continue/OK popup transitions found.';};
function describe(step,index){return `${index+1}. ${step.type==='checkpoint'?step.checkpoint.title:step.type==='text'?'Type text':step.type.startsWith('key')?step.key:(step.target?.aria||step.target?.text||step.type)}`;}
function drawTiming(){
  const valid=timingCandidates(current.steps);
  for(const [id,key,indexes] of [['timerStart','missionStart',valid.starts],['timerFinish','completionGate',valid.finishes]]){
    const select=$(id);select.replaceChildren(new Option('Choose a step…',''));
    for(const i of indexes)select.add(new Option(describe(current.steps[i],i),String(i)));
    const chosen=current.steps.findIndex(s=>s[key]);select.value=chosen<0?'':String(chosen);
  }
}
for(const [id,key] of [['timerStart','missionStart'],['timerFinish','completionGate']])$(id).onchange=()=>{
  for(const step of current.steps)delete step[key];
  if($(id).value!=='')current.steps[Number($(id).value)][key]=true;
  current.timingReviewed=false;$('timingReviewed').checked=false;$('reviewed').checked=false;drawSteps();
};
function reviewImported(r){openReview(exportRecording(validateRecording(r),{notes:r.notes||''}));}
function openReview(r){$('playbackDiagnostic').textContent='';void request('status').then(({status})=>{if(status.mode==='paused'&&status.name===r.name&&current?.id===r.id)$('playbackDiagnostic').textContent='Paused replay — '+status.message+'\n'+JSON.stringify(r.steps.slice(status.index,status.index+1).map((s,j)=>({step:status.index+j+1,type:s.type,target:s.target,x:s.x,y:s.y,buttons:s.buttons})),null,2);}).catch(()=>{});current=structuredClone(r);reviewOriginal=exportRecording(r,{notes:r.notes||''});$('approveShared').hidden=!r.source;$('save').textContent=r.source?'Save personal copy':'Save';$('replace').hidden=!r.id||!!r.source;$('sharedNotice').hidden=!r.source;$('missionName').value=r.name;$('notes').value=r.notes||'';$('reviewed').checked=false;$('reviewError').textContent='';current.minimumMs=r.minimumMs||180000;$('timingReviewed').checked=!!r.timingReviewed;$('minimumDisplay').textContent=`${Math.floor(current.minimumMs/60000)}:${String((current.minimumMs/1000)%60).padStart(2,'0')}`;drawSteps();drawTiming();$('review').showModal();}
function edited(){current.name=$('missionName').value.trim();current.notes=$('notes').value;current.minimumMs=current.minimumMs||180000;current.timingReviewed=$('timingReviewed').checked;validateRecording(current);if(current.timingReviewed)missionTiming(current);return current;}
$('close').onclick=()=>$('review').close();
$('save').onclick=async()=>{try{edited();const result=current.id?await request('save',{recording:current}):await request('import',{recording:current});current.id=result.id;delete current.source;$('approveShared').hidden=true;$('sharedNotice').hidden=true;$('save').textContent='Save';await refresh();$('reviewError').textContent=result.personalCopy?'Personal copy saved. Shared original is unchanged.':'Saved locally.';}catch(e){$('reviewError').textContent=e.message;}};
function downloadable(){if(!$('reviewed').checked)throw Error('Review the recording and check the review box first.');const ready=edited();missionTiming(ready);return exportRecording(ready,{notes:current.notes});}
function download(r,filename){const blob=new Blob([JSON.stringify(r,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=filename||((r.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'mission')+'.json');a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('export').onclick=()=>{try{download(downloadable());$('reviewError').textContent='Exported. Nothing has been published.';}catch(e){$('reviewError').textContent=e.message;}};
$('share').onclick=async()=>{try{
  $('share').disabled=true;$('reviewError').textContent='Connecting and publishing…';
  const result=await request('publishRecording',{recording:downloadable(),reviewed:$('reviewed').checked});
  $('reviewError').textContent=result.duplicate?'This recording is already in the shared library.':'Published to GitHub. Everyone receives it on their next sync; GitHub caching may cause a short delay.';
  await refreshPublisher();
}catch(e){$('reviewError').textContent=e.message;}finally{$('share').disabled=false;}};
async function refreshPublisher(){const state=await request('publisherStatus');$('publisherStatus').textContent=!state.configured?'Automatic publishing is awaiting the owner’s hosting setup. Export JSON remains available.':state.login?`Connected as ${state.login}. Shared recordings are public.`:'Connect GitHub to publish reviewed recordings. No repository editing access is requested.';$('connectPublisher').disabled=!state.configured;$('disconnectPublisher').hidden=!state.login;}
$('connectPublisher').onclick=async()=>{try{$('connectPublisher').disabled=true;await request('connectPublisher');await refreshPublisher();}catch(e){$('publisherStatus').textContent=e.message;}finally{$('connectPublisher').disabled=false;}};
$('disconnectPublisher').onclick=async()=>{await request('disconnectPublisher');await refreshPublisher();};
$('approveShared').onclick=async()=>{try{
  if(!$('reviewed').checked)throw Error('Review the inputs and check the review box first.');
  const r=edited();missionTiming(r);
  if(JSON.stringify(exportRecording(r,{notes:r.notes||''}))!==JSON.stringify(reviewOriginal))throw Error('You edited this version. Save a personal copy, or reopen the unchanged shared recording to approve it.');
  await request('approveShared',{id:r.id,hash:r.source.hash});await refresh();$('reviewError').textContent='This shared version is ready to select for replay.';
}catch(e){$('reviewError').textContent=e.message;}};
$('replace').onclick=()=>$('replacementFile').click();
$('replacementFile').onchange=async e=>{
  const file=e.target.files[0],id=current?.id;e.target.value='';
  try{
    if(!file)return;
    if(!id||current.source)throw Error('Choose a saved personal recording to replace.');
    if(file.size>25000000)throw Error('Recording exceeds 25 MB.');
    $('replace').disabled=true;
    const original=await request('get',{id});
    const {status}=await request('status');
    if(status.mode!=='idle')throw Error('Stop recording or replay before replacing a saved mission.');
    const replacement=exportRecording(validateRecording(JSON.parse(await file.text())),{name:original.name,notes:''});
    if(new URL(replacement.startURL).pathname!==new URL(original.startURL).pathname)throw Error('Replacement must use the same starting space.');
    replacement.notes=String(JSON.parse(await file.text()).notes||original.notes||'').slice(0,4000);
    if(replacement.timingReviewed)missionTiming(replacement);
    await request('import',{recording:exportRecording(original,{name:(original.name+' — before repair').slice(0,120),notes:original.notes||''})});
    const saved={...replacement,id,created:original.created};
    await request('save',{recording:saved});
    openReview(saved);await refresh();$('reviewError').textContent='Replaced locally. The original is saved as a separate “before repair” backup.';
  }catch(error){$('reviewError').textContent=error.message;}
  finally{$('replace').disabled=false;}
};
$('import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>25000000)throw Error('Recording exceeds 25 MB.');reviewImported(JSON.parse(await f.text()));}catch(e){$('error').textContent=e.message;}finally{$('import').value='';}};
async function synchronize(force){
  $('loadShared').disabled=true;$('syncStatus').textContent='Syncing shared missions…';
  try{const result=await request('sync',{force});await refresh();if(result.deferred)$('syncStatus').textContent=result.message;}
  catch(e){$('syncStatus').textContent=`Sync unavailable: ${e.message}`;}
  finally{$('loadShared').disabled=false;}
}
$('loadShared').onclick=()=>synchronize(true);
$('librarySearch').oninput=()=>refresh().catch(e=>$('error').textContent=e.message);
chrome.storage.onChanged.addListener((_changes,area)=>{if(area==='local')refresh().catch(()=>{});});
await refresh();await refreshPublisher();void synchronize(false);
