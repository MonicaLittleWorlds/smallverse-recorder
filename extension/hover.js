import {checkpointEqual} from './core.js';
export async function waitForHoverIdentity(step,{probe,read,move,sleep}){
  const check=async()=>{const p=await probe();if(!checkpointEqual(step.checkpoint,p.checkpoint))throw Error('Objective changed before checking the door label.');};
  await check();await move({x:20,y:20});
  let cleared=false;
  for(let i=0;i<10;i++){await check();if(!(await read())?.matches){cleared=true;break;}await sleep(200);}
  if(!cleared)throw Error('Close the existing item information label, then Resume. A fresh hover label is required.');
  await check();await move({x:step.x,y:step.y});
  let consecutive=0;
  for(let i=0;i<16;i++){
    await check();consecutive=(await read())?.matches?consecutive+1:0;
    if(consecutive>=2){await check();return;}
    await sleep(250);
  }
  throw Error(`The saved position did not reveal ${step.hoverIdentity.title}. Replay paused without clicking.`);
}
