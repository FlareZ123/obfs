'use strict';

const fs=require('node:fs');
const {parentPort,workerData}=require('node:worker_threads');
const {createPrivateMachine}=require('./sco-ratchet-boundary');

/** @typedef {{rootHex:string,principal:string}} Configuration */
/** @typedef {{kind:'batch',id:number,start:number,inputs:string[],signal?:string}} Task */

if(!parentPort)throw new TypeError('Trusted SCO private worker requires a message port');
const port=parentPort;
const config=/** @type {Configuration} */(workerData);
const machine=createPrivateMachine(Buffer.from(config.rootHex,'hex'));

/** @param {Task} task @returns {void} */
function handle(task){
  if(task.kind!=='batch'||!Number.isSafeInteger(task.start)||!Array.isArray(task.inputs)){
    throw new TypeError('Unexpected private worker task');
  }
  const startNs=process.hrtime.bigint();
  if(task.signal){
    // Unique one-shot test marker, never a public service artifact.
    fs.writeFileSync(task.signal+'.tmp','go');
    fs.renameSync(task.signal+'.tmp',task.signal);
  }
  /** @type {string[]} */
  const values=[];
  for(let i=0;i<task.inputs.length;i++){
    const value=machine.advance(config.principal,task.start+i,task.inputs[i]);
    if(value===null)throw new TypeError('Invalid account sequence in trusted worker');
    values.push(value);
  }
  const endNs=process.hrtime.bigint();
  port.postMessage({phase:'result',id:task.id,values,
    startNs:startNs.toString(),endNs:endNs.toString()});
}
port.on('message',handle);
port.postMessage({phase:'ready'});
