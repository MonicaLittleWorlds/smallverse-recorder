import {exportRecording,validateRecording} from './core.js';
const $=id=>document.getElementById(id);
async function request(kind,extra={}){const r=await chrome.runtime.sendMessage({kind,...extra});if(!r.ok)throw Error(r.error);return r.value;}
let current;
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn)=>{const b=node('button',text);b.onclick=()=>Promise.resolve().then(fn).catch(e=>$('error').textContent=e.message);return b;};
async function refresh(){
  const {recordings}=await request('status');$('recordings').replaceChildren();
  for(const r of recordings){const card=node('div');card.className='mission';card.append(node('h3',r.name),node('p',`${r.count} steps · ${r.viewport.width} × ${r.viewport.height}`));const actions=node('div');actions.className='row';actions.append(button('Review / Export',async()=>openReview(await request('get',{id:r.id}))),button('Delete',async()=>{if(confirm(`Delete ${r.name} from this browser? Export it first if you need a backup.`)){await request('delete',{id:r.id});await refresh();}}));card.append(actions);$('recordings').append(card);}
}
function drawSteps(){
  $('summary').textContent=`${current.steps.length} steps · ${current.steps.filter(s=>s.type==='text').length} typed entries · ${current.steps.filter(s=>s.patch).length} visual targets`;
  $('steps').replaceChildren();
  current.steps.forEach((s,i)=>{
    const row=node('div');row.className='step';
    let details=s.type==='text'?`Text: ${s.value}`:s.type==='checkpoint'?`Checkpoint: ${s.checkpoint.title}\n${s.checkpoint.text}`:s.type.startsWith('key')?`${s.type}: ${s.key}`:`${s.type}${s.target?' · '+(s.target.aria||s.target.title||s.target.text||s.target.tag):''}${s.x!==undefined?` · (${Math.round(s.x)}, ${Math.round(s.y)})`:''}`;
    row.append(node('span',`${i+1}. ${(s.at/1000).toFixed(1)}s · ${details}`));
    if(s.patch){const c=node('canvas');c.width=s.patch.width;c.height=s.patch.height;c.style.width='64px';c.style.height='64px';c.title='Visual target captured near this click';const ctx=c.getContext('2d'),data=ctx.createImageData(c.width,c.height);s.patch.data.forEach((v,j)=>{data.data.set([v,v,v,255],j*4);});ctx.putImageData(data,0,0);row.append(c);}
    row.append(button('Remove',()=>{current.steps.splice(i,1);$('reviewed').checked=false;drawSteps();}));$('steps').append(row);
  });
}
function reviewImported(r){openReview(exportRecording(validateRecording(r),{notes:r.notes||''}));}
function openReview(r){current=structuredClone(r);$('missionName').value=r.name;$('notes').value=r.notes||'';$('reviewed').checked=false;$('reviewError').textContent='';drawSteps();$('review').showModal();}
function edited(){current.name=$('missionName').value.trim();current.notes=$('notes').value;return validateRecording(current);}
$('close').onclick=()=>$('review').close();
$('save').onclick=async()=>{try{edited();if(current.id)await request('save',{recording:current});else{const result=await request('import',{recording:current});current.id=result.id;}await refresh();$('reviewError').textContent='Saved locally.';}catch(e){$('reviewError').textContent=e.message;}};
$('export').onclick=()=>{try{if(!$('reviewed').checked)throw Error('Review the recording and check the export box first.');const r=exportRecording(edited(),{notes:current.notes});const blob=new Blob([JSON.stringify(r,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=(r.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'mission')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('reviewError').textContent='Exported. The file is not published until you upload it to GitHub.';}catch(e){$('reviewError').textContent=e.message;}};
$('import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>25000000)throw Error('Recording exceeds 25 MB.');reviewImported(JSON.parse(await f.text()));}catch(e){$('error').textContent=e.message;}finally{$('import').value='';}};
$('loadShared').onclick=async()=>{try{$('shared').replaceChildren(node('p','Loading…'));const entries=await request('catalog');$('shared').replaceChildren();if(!entries.length)$('shared').append(node('p','No shared recordings yet. Record and publish the first one.'));for(const entry of entries){const card=node('div');card.className='mission';card.append(node('h3',entry.name),node('p',entry.description||''),button('Download to review',async()=>reviewImported(await request('sharedImport',{path:entry.path}))));$('shared').append(card);}}catch(e){$('shared').replaceChildren(node('p',e.message));}};
await refresh();
