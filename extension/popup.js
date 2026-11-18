const $=id=>document.getElementById(id);
async function request(kind,extra={}){const r=await chrome.runtime.sendMessage({kind,...extra});if(!r.ok)throw Error(r.error);return r.value;}
let tabId;
async function refresh(){
  const {status,recordings}=await request('status');
  $('status').textContent=status.mode==='idle'?'Ready':`${status.mode} · ${status.name}`;
  $('message').textContent=`${status.message||''}${status.mode!=='idle'?` (${status.mode==='recording'?status.count:status.index+' / '+status.count} steps)`:''}`;
  const selected=$('saved').value;const available=recordings.map(r=>r.id+':'+r.name).join('|');
  if($('saved').dataset.entries!==available){$('saved').replaceChildren(...recordings.map(r=>new Option(`${r.name} · ${r.count} steps`,r.id)));$('saved').dataset.entries=available;if(recordings.some(r=>r.id===selected))$('saved').value=selected;}
  $('record').disabled=status.mode!=='idle'||!tabId;
  $('play').disabled=status.mode!=='idle'||!tabId||!recordings.length||!$('ready').checked;
  $('pause').disabled=!['playing','paused'].includes(status.mode);$('stop').disabled=status.mode==='idle';
  $('coordinates').hidden=status.mode!=='paused';
}
function action(id,fn){$(id).onclick=async()=>{try{$('error').textContent='';$(id).disabled=true;await fn();await refresh();}catch(e){$('error').textContent=e.message;await refresh().catch(()=>{});}};}
action('record',async()=>{if(!$('name').value.trim())throw Error('Give this mission a name first.');await request('start',{tabId,name:$('name').value});window.close();});
action('play',async()=>{await request('play',{tabId,id:$('saved').value});window.close();});
action('stop',()=>request('stop'));action('pause',()=>request('pause'));
action('coordinates',async()=>{if(confirm('This bypasses visual matching for one click. Only proceed if the game view matches the recording.'))await request('coordinates');});
$('ready').onchange=refresh;
const tabs=await chrome.tabs.query({active:true,currentWindow:true});
if(tabs[0]?.url?.startsWith('https://smallverse.app/space/'))tabId=tabs[0].id;
else $('error').textContent='Open a SmallVerse space to start recording or replay.';
await refresh();setInterval(()=>refresh().catch(()=>{}),700);
