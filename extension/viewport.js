export const sameViewport=(a,b)=>a?.width===b?.width&&a?.height===b?.height;
export const playbackViewport=s=>s.playbackViewport||s.recording.viewport;
// A candidate only: hidden targets must still pass their hover/landmark checks.
export function centeredPoint(point,recorded,current){return {x:point.x+(current.width-recorded.width)/2,y:point.y+(current.height-recorded.height)/2};}
export function pointInside(point,viewport){return Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.y>=0&&point.x<viewport.width&&point.y<viewport.height;}
