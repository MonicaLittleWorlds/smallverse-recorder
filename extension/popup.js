const $=id=>document.getElementById(id);
async function request(kind,extra={}){const r=await chrome.runtime.sendMessage({kind,...extra});if(!r.ok)throw Error(r.error);return r.value;}
let tabId,recoveryId;
async function loadRecovery(){const id=$('saved').value;if(id===recoveryId)return;recoveryId=id;$('recoveryObjective').replaceChildren(new Option('Choose the current objective…',''));if(!id)return;try{const entries=await request('recoveryObjectives',{id});if(recoveryId!==id)return;for(const e of entries)$('recoveryObjective').add(new Option(`${e.index+1}. ${e.checkpoint.title} — ${e.checkpoint.text.slice(0,100)}`,String(e.index)));}catch{recoveryId=undefined;}}
async function refresh(){
  const {status,recordings}=await request('status');
  $('status').textContent=status.mode==='idle'?'Ready':`${status.mode} · ${status.name}`;
  $('message').textContent=`${status.message||''}${status.mode!=='idle'?` (${status.mode==='recording'?status.count:status.index+' / '+status.count} steps)`:''}`;
  const query=$('missionSearch').value.trim().toLocaleLowerCase();
  const usable=recordings.filter(r=>!r.source?.retired&&r.name.toLocaleLowerCase().includes(query));
  $('searchStatus').textContent=usable.length?`${usable.length} mission${usable.length===1?'':'s'} found`:'No matching missions.';
  const selected=$('saved').value;const available=usable.map(r=>r.id+':'+r.name+':'+r.reviewRequired).join('|');
  if($('saved').dataset.entries!==available){$('saved').replaceChildren(...usable.map(r=>new Option(`${r.name}${r.source?' · shared':''}${r.reviewRequired?' · review required':''}`,r.id)));$('saved').dataset.entries=available;if(usable.some(r=>r.id===selected))$('saved').value=selected;else if(usable.length)$('saved').value=usable[0].id;$('ready').checked=false;}
  $('record').disabled=status.mode!=='idle'||!tabId;
  $('play').disabled=status.mode!=='idle'||!tabId||!usable.length||!$('saved').value||!$('ready').checked;
  $('resumeRecording').disabled=status.mode!=='idle'||!tabId||!usable.some(r=>r.id===$('saved').value&&!r.source);
  $('pause').disabled=!['playing','paused'].includes(status.mode);$('stop').disabled=status.mode==='idle';
  $('coordinates').hidden=status.mode!=='paused';
  $('pause').textContent=status.mode==='paused'?'Resume playback':'Pause playback';
  $('resumeObjective').disabled=!['idle','paused'].includes(status.mode)||!tabId||!$('saved').value;
  void loadRecovery();
}
function action(id,fn){$(id).onclick=async()=>{try{$('error').textContent='';$(id).disabled=true;await fn();await refresh();}catch(e){$('error').textContent=e.message;await refresh().catch(()=>{});}};}
action('record',async()=>{if(!$('name').value.trim())throw Error('Give this mission a name first.');await request('start',{tabId,name:$('name').value});window.close();});
action('play',async()=>{await request('play',{tabId,id:$('saved').value,positionReplay:$('positionReplay').checked});window.close();});
action('resumeRecording',async()=>{await request('resumeRecording',{tabId,id:$('saved').value});window.close();});
action('captureCheck',async()=>{try{const r=await request('captureCheck',{tabId});$('error').textContent=r.message;}finally{$('captureCheck').disabled=false;}});
action('stop',()=>request('stop'));action('pause',()=>request('pause',{tabId}));
action('resumeObjective',async()=>{if($('recoveryObjective').value==='')throw Error('Select the current objective first.');if(!confirm('Resume from the selected objective? Confirm you have not already performed its recorded actions, especially chat messages. A fresh three-minute minimum starts now.'))return;await request('resumeObjective',{tabId,id:$('saved').value,index:Number($('recoveryObjective').value),positionReplay:$('positionReplay').checked});window.close();});
action('coordinates',async()=>{if(confirm('This bypasses visual matching for one click. Only proceed if the game view matches the recording.'))await request('coordinates');});
$('ready').onchange=refresh;
$('missionSearch').oninput=()=>refresh().catch(e=>$('error').textContent=e.message);
$('saved').onchange=()=>{$('ready').checked=false;void refresh();};
const tabs=await chrome.tabs.query({active:true,currentWindow:true});
if(tabs[0]?.url?.startsWith('https://smallverse.app/space/'))tabId=tabs[0].id;
else $('error').textContent='Open a SmallVerse space to start recording or replay.';
await refresh();setInterval(()=>refresh().catch(()=>{}),700);

void request('sync').catch(()=>{});
