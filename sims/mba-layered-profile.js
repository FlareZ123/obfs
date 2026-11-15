'use strict';

const vm=require('node:vm');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {layerXorFunctions}=require('../workplace/layered-mba');

const original='function kernel(x,y){return (x^y)|0;}module.exports=kernel;';

/** @param {string} source @returns {(x:number,y:number)=>number} */
function compile(source){
  /** @type {{module:{exports:unknown}}} */
  const scope={module:{exports:null}};
  vm.runInNewContext(source,scope,{timeout:2000});
  return /** @type {(x:number,y:number)=>number} */ (scope.module.exports);
}

/** @param {(x:number,y:number)=>number} fn @param {number} n @param {boolean} mixed @returns {number} */
function work(fn,n,mixed){
  let acc=0;
  for(let i=0;i<n;i++){
    const a=Math.imul(i,1664525)|0;
    const b=(Math.imul(i,22695477)^0xa538)|0;
    const value=fn(a,b);
    acc^=mixed?((value+Math.imul(a,47)+((b&255)<<7))|0):value;
  }
  return acc;
}
/** @param {number[]} samples @returns {number} */
function median(samples){return [...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)];}

/** @param {boolean} mixed @returns {object} */
function profile(mixed){
  const obf=layerXorFunctions(original,{sourceType:'commonjs',seed:'agent17/layer-perf',names:['kernel']});
  assert.equal(obf.rewrites,1);
  const native=compile(original),candidate=compile(obf.code);
  for(let i=0;i<8;i++){
    assert.equal(work(native,100000,mixed),work(candidate,100000,mixed));
  }
  /** @type {number[]} */ const nativeTimes=[];
  /** @type {number[]} */ const obfTimes=[];
  for(let trial=0;trial<17;trial++){
    /** @type {Array<[(x:number,y:number)=>number,number[]]>} */
    const order=trial%2===0?[[native,nativeTimes],[candidate,obfTimes]]:
      [[candidate,obfTimes],[native,nativeTimes]];
    for(const [fn,values] of order){
      const begin=performance.now();
      assert.ok(Number.isInteger(work(fn,300000,mixed)));
      values.push(performance.now()-begin);
    }
  }
  const nativeMs=median(nativeTimes),candidateMs=median(obfTimes);
  return {name:mixed?'surrounding-arithmetic':'pure-bitwise',nativeMs,candidateMs,
    ratio:candidateMs/nativeMs,within2_5x:candidateMs/nativeMs<=2.5,
    nativeSamplesMs:nativeTimes,candidateSamplesMs:obfTimes};
}
if(require.main===module){
  process.stdout.write(JSON.stringify({platform:process.platform,node:process.version,
    cases:[profile(false),profile(true)]},null,2)+'\n');
}
module.exports={profile};
