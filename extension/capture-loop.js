// capture() owns the global screenshot rate limit. Schedule the next capture
// when the current one finishes, rather than dropping periodic timer ticks.
export function startCaptureLoop({active,capture,schedule=setTimeout,cancel=clearTimeout,retryMs=650}){
 let stopped=false,timer;
 const tick=async()=>{
  if(stopped||!active())return;
  let frame=null;try{frame=await capture();}catch{}
  if(!stopped&&active())timer=schedule(tick,frame?0:retryMs);
 };
 timer=schedule(tick,0);
 return ()=>{stopped=true;cancel(timer);};
}
