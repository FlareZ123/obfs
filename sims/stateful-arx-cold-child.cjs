'use strict';

const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {recordsFor}=require('./stateful-arx-minifier-control');

/**
 * Fresh-process one-session CPU receipt. Loading esbuild and constructing
 * deterministic inputs happens before measurement, identically for all arms.
 * The timed interval contains ESM graph loading plus actual application work.
 * It excludes Node process startup and child process management.
 */
async function main(){
  const modulePath=/** @type {string} */(process.argv[2]);
  const recordCount=Number(process.argv[3]);
  const records=recordsFor(recordCount);
  const seed=-817;
  const importStart=process.cpuUsage();
  const app=/** @type {{runScenario:(seed:number,records:{kind:unknown,payload:unknown}[],host:{emit:(event:unknown)=>void})=>string}} */(
    await import(pathToFileURL(modulePath).href));
  const imported=process.cpuUsage(importStart);
  let callbacks=0;
  const workStart=process.cpuUsage();
  const value=app.runScenario(seed,records,{emit(){callbacks++;}});
  const worked=process.cpuUsage(workStart);
  const cpu=/** @param {NodeJS.CpuUsage} usage */usage=>(usage.user+usage.system)/1000;
  if(callbacks!==recordCount)throw Error('Fresh-process callback count differs');
  console.log(JSON.stringify({
    importMs:cpu(imported),workMs:cpu(worked),
    totalMs:cpu(imported)+cpu(worked),callbacks,
    outputSHA256:createHash('sha256').update(value).digest('hex')
  }));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
