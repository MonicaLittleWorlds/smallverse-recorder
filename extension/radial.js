import {checkpointEqual} from './core.js';
// Resolve one visible, uncovered control twice at a stable location near its opener.
export async function waitForRadialControl(step,{probe,resolve,sleep,anchor}){
  let previous=null;
  for(let attempt=0;attempt<80;attempt++){
    const observed=await probe();
    if(step.checkpoint&&!checkpointEqual(step.checkpoint,observed.checkpoint))throw Error('Objective changed while waiting for the radial button. Replay paused without clicking.');
    const point=await resolve(step.target);
    const near=point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&anchor&&Math.hypot(point.x-anchor.x,point.y-anchor.y)<=240;
    if(near&&previous&&Math.hypot(point.x-previous.x,point.y-previous.y)<=2)return point;
    previous=near?point:null;
    await sleep(150);
  }
  throw Error('The recorded radial button did not become uniquely visible and stable near the selected item. Restore the menu and Resume.');
}
