import {sceneAligned} from './scene.js';
import {waitForRadialControl} from './radial.js';
import {playbackProgress,restorePlayback,expectedCheckpoint,recoveryObjectives,verifyRecoveryObjective} from './playback-state.js';
import {checkForUpdates} from './updates.js';
import {connectPublisher,publisherStatus,publishRecording} from './publishing.js';
import {learnOptionalPopups,runOptionalPopup,popupDecision} from './popups.js';
import {RAW_ROOT,validateCatalog,readBounded,syncShared,sharedReviewed,prepareShare} from './sharing.js';
import {FORMAT,VERSION,MAX_STEPS,gameURL,sameSpace,checkpointEqual,validateRecording,matchPatch,exportRecording,missionTiming,remainingMissionMs,MINIMUM_MISSION_MS,timingCandidates,recordedPointMatches,sameWheelGesture} from './core.js';
let progressQueue=Promise.resolve();
function persistPlayback(){const progress=playbackProgress(session);const write=()=>chrome.storage.local.set({activePlayback:progress});progressQueue=progressQueue.then(write,write);return progressQueue;}
let lastCaptureAt=0;
let captureQueue=Promise.resolve();
const ROOT=RAW_ROOT;
let syncJob=null;
const SYNC_ALARM='shared-mission-sync';
let session=null, serial=Promise.resolve(), lifecycle=Promise.resolve(), frameTimer=null, frame=null, captureBusy=false, storeQueue=Promise.resolve();
let lastStatus={mode:'idle',message:'Ready. Open a SmallVerse space to record.'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const page=(tabId,m)=>chrome.tabs.sendMessage(tabId,m);
const command=(tabId,method,params={})=>chrome.debugger.sendCommand({tabId},method,params);
const localLibrary=async()=> (await chrome.storage.local.get('recordings')).recordings||{};
const library=async()=>({...await localLibrary(),...((await chrome.storage.local.get('sharedRecordings')).sharedRecordings||{})});
async function put(r){const saved=structuredClone(r);const write=async()=>{const all=await localLibrary();all[saved.id]=saved;await chrome.storage.local.set({recordings:all});};storeQueue=storeQueue.then(write,write);return storeQueue;}
function snapshot(){return session?{mode:session.mode,name:session.recording.name,count:session.recording.steps.length,index:session.index||0,message:session.message||'',tabId:session.tabId,remainingMs:session.waitRemaining??null}:lastStatus;}
async function notify(){
  const s=snapshot();await persistPlayback();await chrome.storage.session.set({status:s,activeRecording:session?.mode==='recording'?{tabId:session.tabId,started:session.started,id:session.recording.id,markFinalPending:!!session.markFinalPending,finalMarkedDuringRecording:!!session.finalMarkedDuringRecording,acceptedFrom:session.acceptedFrom||null,visualDisconnected:!!session.visualDisconnected}:null});
  await chrome.action.setBadgeText({text:s.mode==='recording'?'REC':s.mode==='playing'?'▶':s.mode==='paused'?'Ⅱ':''});
  await chrome.action.setBadgeBackgroundColor({color:s.mode==='recording'?'#b74343':'#246b65'});
  if(session)page(session.tabId,{kind:'mode',mode:session.mode,started:session.started,label:session.waitRemaining>0?`Waiting · ${Math.ceil(session.waitRemaining/1000)}s until minimum time`:`${s.mode} · ${session.mode==='recording'?s.count:s.index+'/'+s.count}${session.markFinalPending?' · Next action starts final task':''}${session.visualDisconnected?' · Visual capture lost; inputs still saving':''}`}).catch(()=>{});
}
async function ensureGame(tabId){const tab=await chrome.tabs.get(tabId);if(!gameURL(tab.url))throw Error('Open a SmallVerse space first.');return tab;}
async function probe(tabId){try{return await page(tabId,{kind:'probe'});}catch{await chrome.scripting.executeScript({target:{tabId},files:['content.js']});return page(tabId,{kind:'probe'});}}
async function attach(tabId,viewport){
  await ensureGame(tabId);
  await probe(tabId);
  await chrome.debugger.attach({tabId},'1.3');
  try{
    await command(tabId,'Page.enable');
    await sleep(250);
    const p=await probe(tabId);
    if(viewport&&(p.viewport.width!==viewport.width||p.viewport.height!==viewport.height))throw Error(`Game view must match the recording: ${viewport.width}×${viewport.height}; current ${p.viewport.width}×${p.viewport.height}. Resize the window before replay.`);
    return p;
  }catch(e){await detach(tabId);throw e;}
}
async function detach(tabId){await chrome.debugger.detach({tabId}).catch(()=>{});}
async function capture(tabId,viewport){
  const take=async()=>{
    await sleep(Math.max(0,550-(Date.now()-lastCaptureAt)));
    const tab=await ensureGame(tabId);
    if(!tab.active)throw Error('Keep the recording game tab visible for visual capture.');
    const p=await probe(tabId);
    if(p.viewport.width!==viewport.width||p.viewport.height!==viewport.height)throw Error('Game view size changed. Restore the original window size.');
    lastCaptureAt=Date.now();
    const data=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});
    const after=await chrome.tabs.get(tabId);
    if(!after.active||after.url!==tab.url)throw Error('Game tab changed during capture.');
    return {data,at:lastCaptureAt};
  };
  const pending=captureQueue.then(take,take);captureQueue=pending.catch(()=>{});
  const {data,at:capturedAt}=await pending;
  const blob=await (await fetch(data)).blob();
  const bitmap=await createImageBitmap(blob);
  // Matching uses half-resolution pixels; all replay coordinates remain CSS pixels.
  const w=Math.round(viewport.width/2),h=Math.round(viewport.height/2),canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const ratio=bitmap.width/bitmap.height;
  if(Math.abs(ratio-viewport.width/viewport.height)>.015){bitmap.close();throw Error(`Screenshot geometry ${bitmap.width}×${bitmap.height} differs from game ${viewport.width}×${viewport.height}.`);}
  ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
  const rgba=ctx.getImageData(0,0,w,h).data,gray=new Uint8Array(w*h);
  for(let i=0;i<gray.length;i++)gray[i]=Math.round(rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114);
  return {width:w,height:h,data:gray,at:capturedAt,scaleX:viewport.width/w,scaleY:viewport.height/h};
}
function patchAt(f,x,y,size=32){
  const w=Math.min(size,f.width),h=Math.min(size,f.height),cx=x/f.scaleX,cy=y/f.scaleY,left=Math.max(0,Math.min(f.width-w,Math.round(cx-w/2))),top=Math.max(0,Math.min(f.height-h,Math.round(cy-h/2)));
  const data=[];for(let j=0;j<h;j++)for(let i=0;i<w;i++)data.push(f.data[(top+j)*f.width+left+i]);
  const mean=data.reduce((a,b)=>a+b,0)/data.length;
  if(size===32&&data.reduce((a,b)=>a+(b-mean)**2,0)/data.length<70)return patchAt(f,x,y,64);
  return {width:w,height:h,offsetX:cx-left,offsetY:cy-top,data};
}
function startFrames(s){
  frameTimer=setInterval(async()=>{if(captureBusy||session!==s||s.mode!=='recording')return;captureBusy=true;try{frame=await capture(s.tabId,s.recording.viewport);if(s.visualDisconnected){s.visualDisconnected=false;s.message='Recording inputs and visual targets.';await notify();}}catch(e){frame=null;s.visualDisconnected=true;s.message='Inputs are saving, but visual capture failed: '+e.message;await notify();}finally{captureBusy=false;}},650);
}
async function startRecord(tabId,name){
  if(session)throw Error('Stop the current session first.');
  const tab=await ensureGame(tabId),p=await attach(tabId,null);
  const r={format:FORMAT,version:VERSION,id:crypto.randomUUID(),name:String(name||'New mission').trim().slice(0,120)||'New mission',created:new Date().toISOString(),startURL:tab.url,viewport:p.viewport,notes:'',minimumMs:MINIMUM_MISSION_MS,timingReviewed:false,steps:[]};
  session={tabId,mode:'recording',started:Date.now(),recording:r,message:'Recording inputs and objective changes.',index:0,heldKeys:new Map(),buttons:0};
  if(p.checkpoint.title)r.steps.push({type:'checkpoint',at:0,checkpoint:p.checkpoint,url:tab.url});
  try{frame=await capture(tabId,r.viewport);}catch(e){frame=null;session.visualDisconnected=true;session.message='Inputs are saving, but visual capture failed: '+e.message;}
  await put(r);await notify();startFrames(session);return snapshot();
}
async function resumeRecord(tabId,id){
  if(session)throw Error('Stop the current session first.');
  await serial;await storeQueue;
  const original=(await localLibrary())[id];validateRecording(original);
  if(original.source||!original.steps.length)throw Error('Choose a personal recording with saved steps.');
  if(original.steps.length>=MAX_STEPS-1)throw Error('This recording is full.');
  const r=structuredClone(original),last=r.steps.at(-1),tab=await ensureGame(tabId);
  if(!sameSpace(tab.url,last.url||r.startURL))throw Error('Return to the space where recording stopped.');
  const expected=[...r.steps].reverse().find(s=>s.checkpoint?.title)?.checkpoint;
  const observed=await probe(tabId);
  if(!expected||!checkpointEqual(expected,observed.checkpoint))throw Error('The current objective differs from the saved endpoint. Missing actions cannot be recovered automatically.');
  const boundary={type:'checkpoint',at:last.at,checkpoint:observed.checkpoint,url:tab.url};
  if(!timingCandidates([...r.steps,boundary]).starts.includes(r.steps.length))throw Error('The recording ended during a held input. Review its last steps before continuing.');
  const p=await attach(tabId,r.viewport);
  if(!checkpointEqual(expected,p.checkpoint)){await detach(tabId);throw Error('The objective changed while reconnecting.');}
  // Preserve an untouched recovery copy before appending to the original recording.
  const backup=structuredClone(original);backup.id=crypto.randomUUID();backup.name=(original.name+' — before continuation').slice(0,120);await put(backup);
  r.steps.push(boundary);r.timingReviewed=false;
  session={tabId,mode:'recording',started:Date.now()-last.at,recording:r,message:'Continuing saved recording. Previous steps preserved.',index:0,heldKeys:new Map(),buttons:0};
  frame=null;try{frame=await capture(tabId,r.viewport);}catch{}
  await put(r);await notify();startFrames(session);return snapshot();
}
async function ingest(sender,step,preFrame){
  const s=session;if(!s||s.mode!=='recording'||sender.tab?.id!==s.tabId)return;
  if(s.recording.steps.length>=MAX_STEPS){await stop('Maximum recording length reached; saved.');return;}
  if(!gameURL(step.url)){await stop('Left SmallVerse; recording saved.');return;}
  // Use only the most recent pre-action frame. Never pretend a post-click frame is a target.
  if(['pointerdown','wheel'].includes(step.type)){
    if(preFrame&&s.started+step.at-preFrame.at>=0&&s.started+step.at-preFrame.at<1400)step.patch=patchAt(preFrame,step.x,step.y);
    else step.visualUnavailable=true;
  }
  step.at=Math.max(step.at,s.recording.steps.at(-1)?.at||0);
  if(step.type==='pointerdown'&&/accept this mission/i.test([step.target?.aria,step.target?.title,step.target?.text].join(' '))){s.acceptedFrom=step.checkpoint;}
  if(s.acceptedFrom&&step.type==='checkpoint'&&step.checkpoint?.title&&!checkpointEqual(s.acceptedFrom,step.checkpoint)){
    if(!s.recording.steps.some(x=>x.missionStart))step.missionStart=true;
    s.acceptedFrom=null;
  }
  if(s.markFinalPending&&timingCandidates([...s.recording.steps,step]).finishes.includes(s.recording.steps.length)){
    for(const previous of s.recording.steps)delete previous.completionGate;
    step.completionGate=true;s.markFinalPending=false;s.finalMarkedDuringRecording=true;
  }
  s.recording.steps.push(step);
  await put(s.recording);await notify();
}
async function release(s){
  if(s.buttons){await command(s.tabId,'Input.dispatchMouseEvent',{type:'mouseReleased',x:s.lastPoint?.x||0,y:s.lastPoint?.y||0,button:s.lastButton||'left',buttons:0,clickCount:1}).catch(()=>{});s.buttons=0;}
  for(const k of s.heldKeys.values())await command(s.tabId,'Input.dispatchKeyEvent',{type:'keyUp',key:k.key,code:k.code,windowsVirtualKeyCode:k.keyCode}).catch(()=>{});
  s.heldKeys.clear();
}
async function stop(message='Stopped. Recording saved locally.'){
  const s=session;if(!s)return snapshot();
  clearInterval(frameTimer);frameTimer=null;
  if(s.mode==='recording')await page(s.tabId,{kind:'flush'}).catch(()=>{});
  // Flush events enter the serial queue; callers must not be on that queue when stopping.
  s.cancelled=true;
  await release(s);
  if(s.mode==='recording'){s.recording.steps=learnOptionalPopups(s.recording.steps);s.recording.version=VERSION;
    if(s.finalMarkedDuringRecording){try{missionTiming({...s.recording,timingReviewed:true});s.recording.timingReviewed=true;}catch{s.recording.timingReviewed=false;}}
  }
  if(s.recording.steps.length&&!s.recording.source)await put(s.recording);
  await page(s.tabId,{kind:'mode',mode:'idle'}).catch(()=>{});
  session=null;frame=null;lastStatus={mode:'idle',message};await detach(s.tabId);await notify();return snapshot();
}
function alive(s){if(session!==s||s.cancelled)throw Error('Cancelled');}
async function safeInput(s,method,params){alive(s);if(s.reconnect)throw Error('Playback disconnected; position retained.');s.inFlight=true;await persistPlayback();alive(s);if(!gameURL((await chrome.tabs.get(s.tabId)).url))throw Error('The tab left SmallVerse.');alive(s);await command(s.tabId,method,params);}
async function gate(s){
  while(s.mode==='paused'){alive(s);await sleep(100);}alive(s);
  const p=await probe(s.tabId);alive(s);
  if(s.documentToken&&p.documentToken&&s.documentToken!==p.documentToken){s.reconnect=true;throw Error('Game document reloaded. Saved playback position retained.');}
  const step=s.recording.steps[s.index];
  if(!sameSpace(step?.url||s.recording.startURL,p.url))throw Error('Different space. Return to the recorded space, then Retry.');
  if(p.viewport.width!==s.recording.viewport.width||p.viewport.height!==s.recording.viewport.height)throw Error('Game view changed. Stop and restart replay to restore its size.');
  return p;
}
async function waitCheckpoint(s,expected,timeout=15000){
  if(!expected?.title)return;
  const end=Date.now()+timeout;
  while(true){
    const p=await gate(s);
    if(checkpointEqual(expected,p.checkpoint))return;
    if(Date.now()>end)throw Error(`Waiting for objective: ${expected.title}. Restore that step, then Retry.`);
    await sleep(180);
  }
}
async function point(s,step){
  if(step.sceneAnchors){
    const observed=await gate(s);
    if(!checkpointEqual(step.checkpoint,observed.checkpoint))throw Error('Objective changed before the repaired door click.');
    const f=await capture(s.tabId,s.recording.viewport);alive(s);
    if(!sceneAligned(f,step.sceneAnchors))throw Error('Visible scene landmarks do not match the repaired door position. Replay paused without clicking.');
    const current=await gate(s);
    if(!checkpointEqual(step.checkpoint,current.checkpoint))throw Error('Objective changed before the repaired door click.');
    s.coordinateOnce=false;return {x:step.x,y:step.y};
  }

  if(step.waitForRadial){
    if(s.index>=s.timing.finish)await waitMinimum(s);
    return waitForRadialControl(step,{probe:()=>gate(s),resolve:target=>page(s.tabId,{kind:'resolve',target}),sleep,anchor:s.lastPoint||s.recording.steps.slice(0,s.index).reverse().find(x=>x.type==='pointerup')});
  }
  if(s.coordinateOnce){s.coordinateOnce=false;return {x:step.x,y:step.y};}
  if(s.positionReplay){
    if(step.target){
      const result=await page(s.tabId,{kind:'verifyPoint',target:step.target,x:step.x,y:step.y});alive(s);
      if(result?.matches)return {x:step.x,y:step.y};
      throw Error('The recorded control is missing, covered, or moved from its saved position. Restore the view, then Retry.');
    }
    if(!step.patch)throw Error('Alignment cannot be verified: this action has no visual reference. Re-record this mission with visual capture working.');
    for(let attempt=0;attempt<3;attempt++){
      await gate(s);await waitCheckpoint(s,step.checkpoint);
      const f=await capture(s.tabId,s.recording.viewport);alive(s);
      if(recordedPointMatches(f,step.patch,step.x,step.y))return {x:step.x,y:step.y};
      if(attempt<2)await sleep(180);
    }
    throw Error('Not enough stable detail matches this click after three checks. Replay paused without clicking. Restore the view and retry.');
  }
  if(step.target){const p=await page(s.tabId,{kind:'resolve',target:step.target});if(!p)throw Error('The recorded control is missing or covered. Restore the view, then Retry.');return p;}
  if(!step.patch)throw Error('No visual target was captured. Use the recorded position once only if the view matches.');
  const f=await capture(s.tabId,s.recording.viewport);alive(s);
  const match=matchPatch(f,step.patch);
  if(!match)throw Error('Visual target is missing, changed, or ambiguous. Restore the view and Retry, or use the recorded position once.');
  return {x:match.x*f.scaleX,y:match.y*f.scaleY};
}
async function execute(s,step){
  if(step.type==='optionalPopup'){
    if(s.buttons||s.heldKeys.size)throw Error('Cannot handle a popup during a held input.');
    s.popupStates??={};const state=s.popupStates[s.index]??={};
    const outcome=await runOptionalPopup(step,{
      probe:()=>gate(s),resolve:target=>{
        if(s.positionReplay){const down=step.originalSteps?.find(x=>x.type==='pointerdown');if(!down||!Number.isFinite(down.x)||!Number.isFinite(down.y))throw Error('This optional popup has no saved click position. Review its recording.');return point(s,down);}
        return page(s.tabId,{kind:'resolve',target});
      },sleep,state,
      click:async p=>{
        const observed=await gate(s);alive(s);const choice=popupDecision(step,observed);
        if(choice==='unknown')throw Error('Unfamiliar dialog. Replay paused without clicking it.');
        if(choice!=='dismiss')return false;
        s.lastPoint=p;s.lastButton='left';
        await safeInput(s,'Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,buttons:0});
        await safeInput(s,'Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});s.buttons=1;
        await safeInput(s,'Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',buttons:0,clickCount:1});s.buttons=0;
      }
    });
    s.message=outcome==='skipped'?'Next objective is visible; optional popup skipped.':'Recorded popup dismissed; next objective confirmed.';
    s.skipNextCheckpointDelay=true;return;
  }

  if(step.type==='checkpoint'){await waitCheckpoint(s,step.checkpoint,30000);return;}
  if(['pointerdown','text','keydown','wheel'].includes(step.type))await waitCheckpoint(s,step.checkpoint);
  await gate(s);
  if(step.type==='pointerdown'){
    const p=await point(s,step);alive(s);s.delta={x:p.x-step.x,y:p.y-step.y};s.lastPoint=p;s.lastButton=step.button;s.gestureStart=s.index;
    await safeInput(s,'Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,buttons:0});
    await safeInput(s,'Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:step.button,buttons:step.buttons,modifiers:step.modifiers||0,clickCount:step.clickCount||1});s.buttons=step.buttons;
  }else if(step.type==='pointerup'||step.type==='pointermove'){
    const x=step.x+(s.delta?.x||0),y=step.y+(s.delta?.y||0);
    if(step.type==='pointerup'&&s.buttons&&(s.lastPoint?.x!==x||s.lastPoint?.y!==y))await safeInput(s,'Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:s.lastButton,buttons:s.buttons,modifiers:step.modifiers||0});
    s.lastPoint={x,y};
    await safeInput(s,'Input.dispatchMouseEvent',{type:step.type==='pointerup'?'mouseReleased':'mouseMoved',x,y,button:step.type==='pointerup'?step.button:(s.buttons?s.lastButton:'none'),buttons:step.buttons,modifiers:step.modifiers||0,...(step.type==='pointerup'?{clickCount:step.clickCount||1}:{})});s.buttons=step.buttons;
  }else if(step.type==='wheel'){
    // Validate the start of a continuous wheel gesture, not intermediate camera frames.
    // Every following click and each new wheel gesture still checks alignment.
    if(s.wheelIndex!==s.index-1||!sameWheelGesture(s.recording.steps[s.index-1],step))await point(s,step);
    await safeInput(s,'Input.dispatchMouseEvent',{type:'mouseWheel',x:step.x,y:step.y,deltaX:step.deltaX,deltaY:step.deltaY,modifiers:step.modifiers||0});s.wheelIndex=s.index;
  }else if(step.type==='text'){
    const p=await page(s.tabId,{kind:'resolve',target:step.target});if(!p?.editable)throw Error('The recorded text field is not available.');
    const selected=await page(s.tabId,{kind:'selectText',target:step.target});if(!selected?.ok)throw Error('Could not focus the recorded text field.');
    await safeInput(s,'Input.insertText',{text:step.value});
    if(!step.value){await safeInput(s,'Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await safeInput(s,'Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});}
  }else if(step.type==='keydown'||step.type==='keyup'){
    const down=step.type==='keydown';
    if(down&&step.target){const focused=await page(s.tabId,{kind:'focus',target:step.target});if(!focused?.ok)throw Error('The recorded keyboard target is missing.');}
    await safeInput(s,'Input.dispatchKeyEvent',{type:down?'rawKeyDown':'keyUp',key:step.key,code:step.code,windowsVirtualKeyCode:step.keyCode,modifiers:step.modifiers||0,autoRepeat:!!step.repeat});
    if(down)s.heldKeys.set(step.code,step);else s.heldKeys.delete(step.code);
  }
}
async function waitMinimum(s){
  if(s.buttons||s.heldKeys.size)throw Error('Cannot wait during a held input. Review the finish marker.');
  while(true){
    await gate(s);
    const remaining=remainingMissionMs(s.missionStarted,performance.now(),s.timing.minimumMs);
    s.waitRemaining=remaining;
    if(remaining<=0){s.waitRemaining=null;s.message='Minimum mission time reached. Rechecking the next action.';await notify();return;}
    const seconds=Math.ceil(remaining/1000);
    if(s.lastWaitSecond!==seconds){s.lastWaitSecond=seconds;s.message=`Waiting ${seconds}s before the finishing action (${s.timing.minimumMs/60000}-minute minimum).`;await notify();}
    await sleep(Math.min(remaining,100));
  }
}
async function run(s){
  if(s.runActive)return;s.runActive=true;
  while(session===s&&s.index<s.recording.steps.length){
    try{
      const step=s.recording.steps[s.index];
      const delay=step.waitForRadial||(s.skipNextCheckpointDelay&&step.type==='checkpoint')?0:Math.max(0,step.at-(s.recording.steps[s.index-1]?.at||0));
      s.skipNextCheckpointDelay=false;
      // Preserve recorded timing, including long movement waits. Pauses do not consume it.
      let remaining=delay;while(remaining>0){await gate(s);const tick=Math.min(remaining,100);await sleep(tick);remaining-=tick;}
      if(s.index===s.timing.finish)await waitMinimum(s);
      await execute(s,step);alive(s);
      // Start only after the recorded objective has actually been observed in replay.
      if(s.index===s.timing.start&&s.missionStarted===null)s.missionStarted=performance.now();
      s.index++;s.inFlight=false;
      if(s.pauseRequested&&!s.buttons&&!s.heldKeys.size){s.pauseRequested=false;s.mode='paused';s.message='Paused. Resume when ready.';}
      await notify();
    }catch(e){
      if(session!==s||s.cancelled)return;
      const partial=s.buttons||s.heldKeys.size||s.inFlight;s.wheelIndex=null;await release(s);
      s.mode='paused';s.message=e.message+(partial?' An input may have been interrupted; select the current objective to resume safely.':'');s.restartRequired=!!partial;await notify();
      while(session===s&&s.mode==='paused')await sleep(100);
    }
  }
  if(session===s)await stop('Replay reached the end of the recording. Check the game for mission completion.');
}
async function play(tabId,id,positionReplay=true){
  if(session)throw Error('Stop the current session first.');
  const r=(await library())[id];validateRecording(r);
  if(r.source?.retired)throw Error('This mission was removed from the shared catalog. Review it and save a personal copy to use it.');
  const reviews=(await chrome.storage.local.get('sharedReviews')).sharedReviews||{};
  if(!sharedReviewed(r,reviews))throw Error('Review this shared version in the library before replay.');
  const timing=missionTiming(r);
  const tab=await ensureGame(tabId);if(!sameSpace(tab.url,r.startURL))throw Error('Open the recording’s starting space before replay.');
  const observed=await attach(tabId,r.viewport);
  await chrome.storage.local.set({playbackRecording:r});
  session={documentToken:observed.documentToken,mode:'playing',positionReplay:positionReplay===true,tabId,recording:r,index:0,timing,missionStarted:null,message:'Replaying. Escape or Alt+Shift+S stops.',heldKeys:new Map(),buttons:0};await notify();void run(session);return snapshot();
}
async function pause(tabId){
  if(!session||session.mode==='recording')throw Error('Pause is available during replay. Stop saves a recording.');
  if(session.mode==='paused'){
    if(session.restartRequired)throw Error('An input may have been interrupted. Use Resume at objective after confirming the game’s current objective.');
    if(session.reconnect){
      const target=tabId||session.tabId,observed=await probe(target),expected=expectedCheckpoint(session.recording,session.index);
      if(!sameSpace(observed.url,session.recording.startURL)||expected&&!checkpointEqual(expected,observed.checkpoint))throw Error('Current objective differs from the saved position. Restore it, or use Resume at objective.');
      try{await command(target,'Page.enable');}catch{await attach(target,session.recording.viewport);}
      const verified=await probe(target);
      if(!sameSpace(verified.url,session.recording.startURL)||expected&&!checkpointEqual(expected,verified.checkpoint))throw Error('Objective changed while reconnecting. Playback remains paused.');
      if(verified.viewport.width!==session.recording.viewport.width||verified.viewport.height!==session.recording.viewport.height)throw Error('Restore the recorded window size before resuming.');
      session.tabId=target;session.documentToken=verified.documentToken;session.reconnect=false;
    }
    session.wheelIndex=null;session.mode='playing';session.message='Replaying.';
  }else if(session.buttons||session.heldKeys.size){session.pauseRequested=true;session.message='Pausing after the current input finishes. Escape stops immediately.';}
  else{session.mode='paused';session.message='Paused. Resume when ready.';}
  await notify();if(session.mode==='playing'&&!session.runActive)void run(session);return snapshot();
}
async function handle(m,sender){
  if(m.kind==='event'){const preFrame=frame;serial=serial.then(()=>ingest(sender,m.step,preFrame)).catch(async e=>{if(session){session.message=e.message;await notify();}});return {ok:true};}
  const extensionControl=sender.url&&['popup.html','library.html'].some(path=>sender.url===chrome.runtime.getURL(path));
  const fromPage=!!sender.tab&&!extensionControl;
  if(fromPage&&!['stop','contentReady','markFinalTask','markMissionStart'].includes(m.kind))throw Error('This command is only available in the extension controls.');
  if(fromPage&&session&&sender.tab.id!==session.tabId)return {ok:false};
  if(m.kind==='markFinalTask'){
    if(session?.mode!=='recording')throw Error('Start recording first.');
    const s=session;await serial;if(session!==s)throw Error('Recording stopped.');
    s.markFinalPending=true;await notify();return {ok:true};
  }
  if(m.kind==='markMissionStart'){
    if(session?.mode!=='recording')throw Error('Start recording first.');
    await serial;const cp=(await probe(session.tabId)).checkpoint;
    const step={type:'checkpoint',at:Date.now()-session.started,checkpoint:cp,missionStart:true,url:session.recording.startURL};
    if(!cp?.title||!timingCandidates([...session.recording.steps,step]).starts.includes(session.recording.steps.length))throw Error('Wait until an active mission objective is visible and release held keys/buttons.');
    for(const previous of session.recording.steps)delete previous.missionStart;
    session.recording.steps.push(step);await put(session.recording);await notify();return {ok:true};
  }
  if(m.kind==='contentReady'){
    if(session&&sender.tab?.id===session.tabId){
      if(session.mode!=='recording'&&m.documentToken&&session.documentToken&&m.documentToken!==session.documentToken){session.mode='paused';session.reconnect=true;session.restartRequired=!!(session.inFlight||session.buttons||session.heldKeys.size);session.message='Game document reloaded. Saved playback position retained; verify the objective before resuming.';}
      await notify();
    }
    return {ok:true};
  }
  if(m.kind==='status'){const reviews=(await chrome.storage.local.get('sharedReviews')).sharedReviews||{};return {status:snapshot(),sync:(await chrome.storage.local.get('syncState')).syncState||{},recordings:Object.values(await library()).map(({steps,...r})=>({...r,count:steps.length,reviewRequired:!sharedReviewed(r,reviews)}))};}
  if(m.kind==='checkUpdates')return checkForUpdates();
  if(m.kind==='sync')return synchronize(!!m.force);
  if(m.kind==='publisherStatus')return publisherStatus();
  if(m.kind==='connectPublisher')return connectPublisher();
  if(m.kind==='disconnectPublisher'){await chrome.storage.session.remove('publisherSession');return {ok:true};}
  if(m.kind==='publishRecording'){
    if(session)throw Error('Stop recording or replay before publishing.');
    const result=await publishRecording(m.recording,m.reviewed);
    void synchronize(true).catch(()=>{});return result;
  }
  if(m.kind==='prepareShare')return prepareShare(m.recording,m.reviewed);
  if(m.kind==='approveShared'){
    const all=(await chrome.storage.local.get('sharedRecordings')).sharedRecordings||{},r=all[m.id];
    if(!r||r.source.hash!==m.hash)throw Error('The shared version changed. Reopen it and review the new version.');
    const reviews=(await chrome.storage.local.get('sharedReviews')).sharedReviews||{};reviews[m.id]=m.hash;await chrome.storage.local.set({sharedReviews:reviews});return {ok:true};
  }
  if(m.kind==='start')return startRecord(m.tabId,m.name);
  if(m.kind==='resumeRecording')return resumeRecord(m.tabId,m.id);
  if(m.kind==='play')return play(m.tabId,m.id,m.positionReplay);
  if(m.kind==='captureCheck'){const own=!session,tabId=session?.tabId||m.tabId,viewport=session?.recording.viewport||(await attach(tabId,null)).viewport;try{let f;for(let i=0;i<3;i++)f=await capture(tabId,viewport);return {message:`Three visual captures passed at ${viewport.width}×${viewport.height}; no viewport resizing used.`};}finally{if(own)await detach(tabId);}}
  if(m.kind==='stop'){if(session?.mode==='recording'){await page(session.tabId,{kind:'flush'}).catch(()=>{});await serial;}return stop('Stopped. Saved recordings are in your library.');}
  if(m.kind==='pause')return pause(m.tabId);
  if(m.kind==='coordinates'){
    if(session?.mode!=='paused'||session.recording.steps[session.index]?.type!=='pointerdown')throw Error('This option is only for a paused pointer target.');
    session.coordinateOnce=true;return pause();
  }
  if(m.kind==='recoveryObjectives'){const r=(await library())[m.id];return recoveryObjectives(r);}
  if(m.kind==='resumeObjective'){
    if(session&&session.mode!=='paused')throw Error('Pause or stop playback before choosing an objective.');
    const r=(await library())[m.id];validateRecording(r);const timing=missionTiming(r);
    if(r.source?.retired||!sharedReviewed(r,(await chrome.storage.local.get('sharedReviews')).sharedReviews||{}))throw Error('Review the shared recording first.');
    const observed=await probe(m.tabId);if(!sameSpace(observed.url,r.startURL))throw Error('Open the recording’s space.');
    verifyRecoveryObjective(r,m.index,observed.checkpoint);
    if(session)await stop('Changing playback recovery point.');
    const verified=await attach(m.tabId,r.viewport);try{verifyRecoveryObjective(r,m.index,verified.checkpoint);}catch(error){await detach(m.tabId);throw error;}
    await chrome.storage.local.set({playbackRecording:r});
    session={tabId:m.tabId,recording:r,index:m.index,timing,positionReplay:m.positionReplay!==false,documentToken:verified.documentToken,missionStarted:performance.now(),mode:'playing',heldKeys:new Map(),buttons:0,message:'Resuming from the verified objective. A fresh three-minute minimum starts now.'};
    await notify();void run(session);return snapshot();
  }
  if(m.kind==='get')return (await library())[m.id];
  if(m.kind==='save'){
    const original=(await library())[m.recording.id];
    if(original?.source){const copy=exportRecording(validateRecording(m.recording),{notes:m.recording.notes||''});copy.id=crypto.randomUUID();copy.created=new Date().toISOString();await put(copy);return {id:copy.id,personalCopy:true};}
    if(session?.recording.id===m.recording.id)throw Error('Stop this recording before editing.');
    const r=validateRecording(m.recording);if(typeof r.id!=='string'||!/^[a-f0-9-]{36}$/.test(r.id))throw Error('Invalid local recording ID.');await put(r);return {ok:true,id:r.id};
  }
  if(m.kind==='import'){
    const source=validateRecording(m.recording),r=exportRecording(source,{notes:source.notes||''});r.id=crypto.randomUUID();r.created=new Date().toISOString();await put(r);return {id:r.id};
  }
  if(m.kind==='delete'){
    if(session?.recording.id===m.id)throw Error('Stop this recording first.');if((await library())[m.id]?.source)throw Error('Shared originals are managed by sync. Save a personal copy to edit.');await storeQueue;const all=await localLibrary();delete all[m.id];await chrome.storage.local.set({recordings:all});return {ok:true};
  }
  if(m.kind==='catalog'){
    const response=await fetch(ROOT+'recordings/index.json',{cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('Shared library is unavailable. Try again later.');
    const value=await response.json();if(!Array.isArray(value)||value.length>500)throw Error('Invalid shared catalog.');return value.filter(e=>typeof e.name==='string'&&/^recordings\/[a-zA-Z0-9_-]+\.json$/.test(e.path)&&e.path!=='recordings/index.json');
  }
  if(m.kind==='sharedImport'){
    if(!/^recordings\/[a-zA-Z0-9_-]+\.json$/.test(m.path)||m.path==='recordings/index.json')throw Error('Invalid recording path.');
    const response=await fetch(ROOT+m.path,{credentials:'omit'});if(!response.ok)throw Error('Shared recording could not be downloaded.');
    const raw=await response.text();if(raw.length>25000000)throw Error('Shared recording exceeds 25 MB.');
    // Download to review; never run or install a recording automatically.
    return validateRecording(JSON.parse(raw));
  }
  throw Error('Unknown command.');
}
const recoveredRecording=(async()=>{
  const saved=(await chrome.storage.session.get('activeRecording')).activeRecording;
  if(!saved){
    const stored=await chrome.storage.local.get(['activePlayback','playbackRecording']);
    if(stored.activePlayback){try{session=restorePlayback(stored.activePlayback,stored.playbackRecording);await notify();}catch(e){lastStatus={mode:'idle',message:'Saved playback could not be restored: '+e.message};}}
    return;
  }
  const recording=(await localLibrary())[saved.id];if(!recording)return;
  try{await ensureGame(saved.tabId);validateRecording(recording);}catch{return;}
  session={...saved,recording,mode:'recording',index:0,heldKeys:new Map(),buttons:0,visualDisconnected:true,message:'Recording restored. Inputs are saving; visual capture needs reconnection.'};
  await notify();
})();
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  const action=async()=>{await recoveredRecording;return handle(m,sender);};
  // Serialize lifecycle/library mutations, but not content events or read-only status queries.
  const p=['start','resumeRecording','play','resumeObjective','pause','stop','save','delete','import','approveShared'].includes(m.kind)?(lifecycle=lifecycle.then(action,action)):action();
  Promise.resolve(p).then(value=>reply({ok:true,value}),error=>reply({ok:false,error:error.message}));return true;
});
chrome.commands.onCommand.addListener(name=>{void recoveredRecording.then(()=>name==='stop'?handle({kind:'stop'},{}):name==='pause'?pause():null).catch(()=>{});});
chrome.debugger.onDetach.addListener(({tabId})=>{if(session?.tabId===tabId){
  const s=session;if(s.cancelled)return;clearInterval(frameTimer);frameTimer=null;frame=null;
  if(s.mode==='recording'){
    s.visualDisconnected=true;s.message='Still recording clicks and typing. Visual capture disconnected; new canvas clicks may need manual target review.';
    void notify();return;
  }
  s.mode='paused';s.reconnect=true;s.restartRequired=!!(s.inFlight||s.buttons||s.heldKeys.size);s.message='Chrome disconnected playback. Your position is saved. Resume to reconnect, or select the current objective if an action was interrupted.';void notify();
}});
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(session?.tabId!==tabId)return;
  // A loading notification alone is not proof that the game document changed.
  // Recording stays active; contentReady restores its toolbar if a new document loads.
  if(change.url&&!gameURL(change.url)){if(session.mode==='recording')void stop('Left SmallVerse. Recording saved.');else{session.mode='paused';session.reconnect=true;session.restartRequired=!!(session.inFlight||session.buttons||session.heldKeys.size);session.message='Game tab navigated away. Playback position retained; return to the mission to resume.';void notify();}}
  // Same-space loading signals alone do not end replay; content document tokens detect real reloads.
});
chrome.tabs.onRemoved.addListener(tabId=>{if(session?.tabId!==tabId)return;if(session.mode==='recording')void stop('Game tab closed. Recording saved.');else{session.mode='paused';session.reconnect=true;session.restartRequired=!!(session.inFlight||session.buttons||session.heldKeys.size);session.message='Game tab closed. Playback position retained; reopen the mission and Resume.';void notify();}});

async function githubText(path,limit){
  return readBounded(await fetch(ROOT+path,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)}),limit);
}
async function synchronize(force=false){
  if(syncJob)return syncJob;
  if(session)return {deferred:true,message:'Sync waits until recording or replay stops.'};
  const previousState=(await chrome.storage.local.get('syncState')).syncState||{};
  if(syncJob)return syncJob;
  if(session)return {deferred:true,message:'Sync waits until recording or replay stops.'};
  if(!force&&Date.now()-(previousState.attemptedAt||0)<60000)return previousState;
  syncJob=(async()=>{
    const attemptedAt=Date.now();
    try{
      const entries=validateCatalog(JSON.parse(await githubText('recordings/index.json',1000000)));
      const previous=(await chrome.storage.local.get('sharedRecordings')).sharedRecordings||{};
      const result=await syncShared(previous,entries,path=>githubText(path,25000000));
      const state={attemptedAt,lastSuccess:Date.now(),added:result.added,updated:result.updated,count:Object.values(result.recordings).filter(r=>!r.source.retired).length,errors:result.errors};
      await chrome.storage.local.set({sharedRecordings:result.recordings,syncState:state});return state;
    }catch(e){const state={...previousState,attemptedAt,error:e.message};await chrome.storage.local.set({syncState:state});return state;}
  })().finally(()=>{syncJob=null;});
  return syncJob;
}
async function setupSync(){await chrome.alarms.create(SYNC_ALARM,{periodInMinutes:30});void synchronize();void checkForUpdates();}
chrome.runtime.onInstalled.addListener(()=>{void setupSync();});
chrome.runtime.onStartup.addListener(()=>{void setupSync();});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===SYNC_ALARM){void synchronize();void checkForUpdates();}});
