import test from 'node:test';import assert from 'node:assert/strict';
import {startCaptureLoop} from '../extension/capture-loop.js';
function harness(capture){const queued=[];let active=true;const stop=startCaptureLoop({active:()=>active,capture,schedule:(fn,ms)=>{const job={fn,ms};queued.push(job);return job;},cancel:job=>{if(job)job.cancelled=true;}});return {queued,stop,deactivate:()=>{active=false;}};}
test('slow successful captures schedule immediately after completion without skipped timer intervals or overlap',async()=>{
 let resolve,calls=0;const h=harness(()=>{calls++;return new Promise(r=>{resolve=r;});});
 const first=h.queued.shift();assert.equal(first.ms,0);const pending=first.fn();assert.equal(calls,1);assert.equal(h.queued.length,0);
 resolve({at:800});await pending;assert.equal(h.queued.length,1);assert.equal(h.queued[0].ms,0);
 const next=h.queued.shift().fn();assert.equal(calls,2);h.stop();resolve({at:1600});await next;assert.equal(h.queued.length,0);
});
test('capture failures back off and stopped or inactive loops cannot restart',async()=>{
 const h=harness(async()=>null);await h.queued.shift().fn();assert.equal(h.queued[0].ms,650);h.stop();assert(h.queued[0].cancelled);
 const second=harness(async()=>({}));second.deactivate();await second.queued.shift().fn();assert.equal(second.queued.length,0);
});
