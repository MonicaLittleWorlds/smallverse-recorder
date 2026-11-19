import {newerVersion,validatedUpdate} from './updates.js';
const banner=document.getElementById('updateBanner'),label=document.getElementById('updateLabel'),link=document.getElementById('updateDownload');
const installed=chrome.runtime.getManifest().version;
document.querySelector('.version').textContent=installed;
function draw(value){try{const release=validatedUpdate(value);banner.hidden=!newerVersion(release.version,installed);label.textContent=`Update available: v${release.version}`;link.href=release.downloadURL;}catch{banner.hidden=true;}}
chrome.storage.local.get('extensionUpdate').then(s=>draw(s.extensionUpdate));
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.extensionUpdate)draw(changes.extensionUpdate.newValue);});
void chrome.runtime.sendMessage({kind:'checkUpdates'}).catch(()=>{});
