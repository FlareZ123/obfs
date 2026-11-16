'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const {compile,NAMES,ROOT}=require('../examples/application-challenge/build.cjs');
const {copyAttack}=require('./application-challenge-offline-copy');

/** @param {number[]} samples @returns {number} */
function median(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {string} variant @param {number[][]} cases @returns {{ms:number,result:unknown[]}} */
function cold(variant,cases){
  const start=performance.now();
  const child=spawnSync(process.execPath,[
    path.join(ROOT,variant,'entry.mjs'),JSON.stringify(cases)
  ],{encoding:'utf8',timeout:30000});
  const ms=performance.now()-start;
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return {ms,result:JSON.parse(child.stdout)};
}

/** @returns {Promise<void>} */
async function main(){
  const compiled=await compile();
  globalThis.window={
    externalValue(value){
      let x=(value^0xa5a5a5a5)>>>0;
      x=Math.imul(x^(x>>>16),0x45d9f3b)>>>0;
      return (x^(x>>>16))>>>0;
    }
  };
  const native=await import(pathToFileURL(path.join(ROOT,'before','app.mjs')).href);
  const delivered=await import(pathToFileURL(path.join(ROOT,'after','app.mjs')).href);
  const hotCases=[[0,150000],[0x9e3779b9,150000],[0xffffffff,150000]];
  const expected=hotCases.map(([seed,count])=>native.evaluate(seed,count));
  assert.deepEqual(hotCases.map(([seed,count])=>delivered.evaluate(seed,count)),expected);
  for(let i=0;i<3;i++){
    for(const [seed,count] of hotCases){
      native.evaluate(seed,count);
      delivered.evaluate(seed,count);
    }
  }
  const hot={native:[],delivered:[]};
  for(let trial=0;trial<9;trial++){
    const order=trial%2?['delivered','native']:['native','delivered'];
    for(const kind of order){
      const fn=kind==='native'?native.evaluate:delivered.evaluate;
      const begin=performance.now();
      const actual=hotCases.map(([seed,count])=>fn(seed,count));
      const ms=performance.now()-begin;
      assert.deepEqual(actual,expected);
      hot[kind].push(ms);
    }
  }
  const coldCases=[[0,120000],[17,120000],[0xffffffff,120000]];
  const wall={native:[],delivered:[]};
  for(let trial=0;trial<7;trial++){
    for(const kind of trial%2?['delivered','native']:['native','delivered']){
      const x=cold(kind==='native'?'before':'after',coldCases);
      wall[kind].push(x.ms);
      assert.deepEqual(x.result,expected.slice(0,0).concat(
        coldCases.map(([seed,count])=>native.evaluate(seed,count))));
    }
  }
  const heldout=Array.from({length:128},(_,i)=>[
    (Math.imul(i+0x1234,0x9e3779b1)^(i<<7))>>>0,
    (i*73)%10000
  ]);
  const attacker=copyAttack(path.join(ROOT,'after'),heldout);
  assert.deepEqual(attacker,heldout.map(([seed,count])=>native.evaluate(seed,count)));
  const bytes=await Promise.all(NAMES.map(async name=>({
    name,
    native:await fs.readFile(path.join(ROOT,'before',name),'utf8'),
    emitted:await fs.readFile(path.join(ROOT,'after',name),'utf8')
  })));
  const hotRatio=median(hot.delivered)/median(hot.native);
  const coldRatio=median(wall.delivered)/median(wall.native);
  const report={
    node:process.version,platform:process.platform,
    sourceFiles:NAMES.length,
    unchangedFiles:bytes.filter(file=>file.native===file.emitted).length,
    originalBytes:bytes.reduce((sum,file)=>sum+Buffer.byteLength(file.native),0),
    emittedBytes:bytes.reduce((sum,file)=>sum+Buffer.byteLength(file.emitted),0),
    crossFileProperties:compiled.crossFile.properties,
    localProperties:compiled.files.reduce((sum,file)=>sum+file.metrics.properties,0),
    nativeOutputMatches:true,
    attack:{kind:'offline distributed-code copy',heldout:heldout.length,matches:heldout.length,
      originalSourceRequired:false},
    hot:{samples:hot,medianNativeMs:median(hot.native),medianDeliveredMs:median(hot.delivered),
      ratio:hotRatio,within2point5:hotRatio<=2.5},
    wholeSession:{samples:wall,medianNativeMs:median(wall.native),
      medianDeliveredMs:median(wall.delivered),ratio:coldRatio,within2point5:coldRatio<=2.5},
    scope:'Single pinned 6-file ESM application and one legitimate host stub, not a universal performance or security proof'
  };
  process.stdout.write('APP_CHALLENGE_PROFILE '+JSON.stringify(report)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
