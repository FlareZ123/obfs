'use strict';

const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {recordsFor}=require('./stateful-arx-minifier-control');

/**
 * Fresh-process, actual real-clock first-use and amplified repeated CPU.
 * Windows reports process CPU in coarse increments, so individual 1-record
 * CPU samples are not resolvable. The source-pinned cold branch therefore
 * uses process.hrtime.bigint wall time; repeated protected work uses CPU
 * only after enough calls to exceed the platform timer quantum.
 */
async function main(){
  const modulePath=/** @type {string} */(process.argv[2]);
  const recordCount=Number(process.argv[3]);
  const records=recordsFor(recordCount);
  const seed=-817;
  const repetitions=recordCount===1?10000:recordCount===50?600:
    recordCount===1000?50:5;
  /** @param {bigint} start @returns {number} */
  const wallMs=start=>Number(process.hrtime.bigint()-start)/1e6;
  const importStart=process.hrtime.bigint();
  const app=/** @type {{runScenario:(seed:number,records:{kind:unknown,payload:unknown}[],host:{emit:(event:unknown)=>void})=>string}} */(
    await import(pathToFileURL(modulePath).href));
  const importWallMs=wallMs(importStart);
  let callbacks=0;
  const firstStart=process.hrtime.bigint();
  const value=app.runScenario(seed,records,{emit(){callbacks++;}});
  const firstWorkWallMs=wallMs(firstStart);
  if(callbacks!==recordCount)throw Error('First-use callback count differs');
  let warmCallbacks=0,warmBytes=0;
  const warmStart=process.cpuUsage();
  for(let index=0;index<repetitions;index++){
    const result=app.runScenario(seed,records,{emit(){warmCallbacks++;}});
    warmBytes+=result.length;
  }
  const warmUsage=process.cpuUsage(warmStart);
  const repeatedCpuMs=(warmUsage.user+warmUsage.system)/1000;
  if(warmCallbacks!==recordCount*repetitions||warmBytes<=0)
    throw Error('Repeated native-contract work did not execute');
  console.log(JSON.stringify({
    importWallMs,firstWorkWallMs,coldWallMs:importWallMs+firstWorkWallMs,
    repeatedCpuMs,repetitions,callbacks,warmCallbacks,
    outputSHA256:createHash('sha256').update(value).digest('hex')
  }));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
