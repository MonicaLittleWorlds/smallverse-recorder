import {checkpointEqual,validateRecording,missionTiming,timingCandidates} from './core.js';
export function playbackProgress(s,now=performance.now()){
  if(!s||s.mode==='recording')return null;
  return {version:1,id:s.recording.id,tabId:s.tabId,index:s.index,positionReplay:s.positionReplay,
    playbackViewport:s.playbackViewport||s.recording.viewport,elapsedMs:s.missionStarted==null?null:Math.max(0,now-s.missionStarted),inFlight:!!s.inFlight,
    buttons:s.buttons||0,heldKeys:[...s.heldKeys.values()],restartRequired:!!s.restartRequired,
    needsSettle:!!s.needsSettle,popupStates:s.popupStates||{},documentToken:s.documentToken||null};
}
export function restorePlayback(saved,recording,now=performance.now()){
  validateRecording(recording);const timing=missionTiming(recording);
  if(saved?.version!==1||saved.id!==recording.id||!Number.isInteger(saved.index)||saved.index<0||saved.index>recording.steps.length)throw Error('Invalid saved playback position.');
  if(saved.elapsedMs!==null&&(!Number.isFinite(saved.elapsedMs)||saved.elapsedMs<0))throw Error('Invalid saved mission timer.');
  const uncertain=!!(saved.inFlight||saved.buttons||saved.heldKeys?.length||saved.restartRequired);
  return {playbackViewport:saved.playbackViewport||recording.viewport,tabId:saved.tabId,recording,index:saved.index,timing,positionReplay:saved.positionReplay!==false,
    missionStarted:saved.elapsedMs===null?null:now-saved.elapsedMs,mode:'paused',reconnect:true,runActive:false,
    heldKeys:new Map((saved.heldKeys||[]).map(k=>[k.code,k])),buttons:saved.buttons||0,
    restartRequired:uncertain,needsSettle:saved.positionReplay===false||!!saved.needsSettle,popupStates:saved.popupStates||{},documentToken:saved.documentToken,
    message:uncertain?'Playback position recovered, but an input may have been interrupted. Select the current objective to resume without repeating an uncertain action.':'Playback position recovered. Resume verifies the current objective before continuing.'};
}
export function expectedCheckpoint(recording,index){
  return recording.steps[index]?.checkpoint||recording.steps.slice(0,index).reverse().find(s=>s.checkpoint)?.checkpoint;
}
export function recoveryObjectives(recording){
  const timing=missionTiming(recording);
  return timingCandidates(recording.steps).starts.filter(i=>i>=timing.start&&i<timing.finish).map(index=>({index,checkpoint:recording.steps[index].checkpoint}));
}
export function verifyRecoveryObjective(recording,index,observed){
  const candidate=recoveryObjectives(recording).find(c=>c.index===index);
  if(!candidate||!checkpointEqual(candidate.checkpoint,observed))throw Error('Selected objective does not match the game. Open the matching objective before resuming.');
  return candidate;
}
