'use strict';

const {parentPort,workerData}=require('node:worker_threads');
const {invertHybrid}=require('./hybrid-reanchor-cegar-attack');

if(parentPort===null)throw new Error('SCO oracle bridge must run in a worker thread');
const port=parentPort;
/** @type {{sharedBuffer:SharedArrayBuffer,target:number,seed:number}} */
const options=workerData;
const state=new Int32Array(options.sharedBuffer);

/** @param {number} input @returns {number} */
function query(input) {
  Atomics.store(state,0,0);
  Atomics.store(state,2,0);
  port.postMessage({query:input>>>0});
  const result=Atomics.wait(state,0,0,120000);
  if(result==='timed-out')throw new Error('Authorized oracle HTTP response timed out');
  if(Atomics.load(state,2)!==0)throw new Error('Authorized oracle HTTP response failed');
  return Atomics.load(state,1)>>>0;
}
const result=invertHybrid(query,options.target,options.seed);
port.postMessage({result});
