import {clean,checkpointEqual} from './core.js';
const named=cp=>!!clean(cp?.title);
export function dismissTarget(target,allowUnlabelled=false){
  if(!target?.dialog||!['button','a'].includes(target.tag))return false;
  const label=clean(target.aria||target.text||target.title);
  return /^(continue|ok|okay)$/i.test(label)||(allowUnlabelled&&!label&&Number.isInteger(target.index));
}
// Only collapse a complete, neutral click followed by an observed objective transition.
// Do not infer outcomes from missing dialogs or consume mission timing markers.
export function popupCandidate(steps,index,{allowUnlabelled=false}={}){
  const down=steps[index];
  if(down?.type!=='pointerdown'||down.button!=='left'||down.modifiers||!dismissTarget(down.target,allowUnlabelled)||!named(down.checkpoint)||down.target.dialog!==down.checkpoint.title)return null;
  let up=index+1;
  while(steps[up]?.type==='pointermove'&&Math.hypot(steps[up].x-down.x,steps[up].y-down.y)<=3)up++;
  if(steps[up]?.type!=='pointerup'||steps[up].button!=='left'||steps[up].buttons||Math.hypot(steps[up].x-down.x,steps[up].y-down.y)>3)return null;
  let next=up+1;
  while(steps[next]?.type==='checkpoint'&&(!named(steps[next].checkpoint)||checkpointEqual(steps[next].checkpoint,down.checkpoint)))next++;
  if(steps[next]?.type!=='checkpoint'||!named(steps[next].checkpoint)||checkpointEqual(steps[next].checkpoint,down.checkpoint))return null;
  let start=index;
  while(start>0&&steps[start-1].type==='checkpoint'&&checkpointEqual(steps[start-1].checkpoint,down.checkpoint))start--;
  // Empty-input boundary is mandatory; never skip release events or an active drag/key hold.
  let buttons=0;const keys=new Set();
  for(const step of steps.slice(0,start)){
    if(step.type==='pointerdown'||step.type==='pointerup')buttons=step.buttons??(step.type==='pointerdown'?1:0);
    if(step.type==='keydown')keys.add(step.code);
    if(step.type==='keyup')keys.delete(step.code);
  }
  if(next-start>100||buttons||keys.size||steps.slice(start,next).some(s=>s.missionStart||s.completionGate||s.optionalDisabled))return null;
  const previous=[...steps.slice(0,start)].reverse().find(s=>s.type==='checkpoint'&&named(s.checkpoint));
  return {start,next,step:{type:'optionalPopup',at:steps[start].at,url:down.url,target:{...down.target,dialogText:down.checkpoint.text},popup:structuredClone(down.checkpoint),next:structuredClone(steps[next].checkpoint),...(previous?{previous:structuredClone(previous.checkpoint)}:{}),originalSteps:structuredClone(steps.slice(start,next))}};
}
export function learnOptionalPopups(steps){
  const output=[];let i=0;
  while(i<steps.length){
    let candidate=null;
    // Look through preceding copies of the popup checkpoint to its dismiss click.
    let click=i;while(steps[click]?.type==='checkpoint')click++;
    candidate=popupCandidate(steps,click);
    if(!candidate||candidate.start!==i)candidate=popupCandidate(steps,i);
    if(candidate&&candidate.start===i){output.push(candidate.step);i=candidate.next;}else output.push(structuredClone(steps[i++]));
  }
  return output;
}
export function popupDecision(step,observation){
  const dialogs=(observation.dialogs??[observation.checkpoint]).filter(cp=>cp&&(clean(cp.title)||clean(cp.text)));
  const allowed=[step.popup,step.next,step.previous].filter(Boolean);
  if(dialogs.some(cp=>!allowed.some(a=>checkpointEqual(a,cp))))return 'unknown';
  // A known popup still covering the next objective must be dismissed first.
  if(dialogs.some(cp=>checkpointEqual(cp,step.popup)))return 'dismiss';
  if(dialogs.some(cp=>checkpointEqual(cp,step.next)))return 'next';
  return 'wait';
}
export async function runOptionalPopup(step,{probe,resolve,click,sleep,now=Date.now,timeout=30000,state={}}){
  const deadline=now()+timeout;
  while(true){
    const choice=popupDecision(step,await probe());
    if(choice==='unknown')throw Error('Unfamiliar dialog. Replay paused without clicking it.');
    if(choice==='next')return state.clicked?'dismissed':'skipped';
    if(choice==='dismiss'&&!state.clicked){
      const target=await resolve(step.target);
      if(target){
        // Recheck after resolving: a popup can disappear while its button is being located.
        const fresh=popupDecision(step,await probe());
        if(fresh==='unknown')throw Error('Unfamiliar dialog. Replay paused without clicking it.');
        if(fresh==='next')return 'skipped';
        if(fresh==='dismiss'){if(await click(target)!==false)state.clicked=true;}
      }
    }
    if(now()>=deadline)throw Error(state.clicked?'Popup was dismissed but the next objective did not appear. Restore the next objective, then Resume.':'Neither the recorded popup nor the next objective became available. Restore the expected task, then Resume.');
    await sleep(150);
  }
}
