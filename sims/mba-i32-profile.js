'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {mixInt32Functions}=require('../workplace/mba-i32-lower');

const source='function kernel(x,y){return ((((x^y)+17)^((x&1023)-y))|0);}module.exports=kernel;';

/** @param {string} text @returns {(x:number,y:number)=>number} */
function load(text) {
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(text,context,{timeout:2000});
  return /** @type {(x:number,y:number)=>number} */ (context.module.exports);
}

/** @param {(x:number,y:number)=>number} kernel @param {number} count @returns {number} */
function work(kernel,count) {
  let acc=0;
  for(let i=0;i<count;i++)acc^=kernel(Math.imul(i,1664525)|0,(Math.imul(i,69069)^0x52eb)|0);
  return acc;
}

/** @param {number[]} samples @returns {number} */
function median(samples){return [...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)];}

/**
 * Paired, alternating runs separately evaluate the chosen transform's hot
 * cost. These measurements exclude transformation time and V8 parse startup.
 * They do not establish a universal 2.5x bound or attacker resistance.
 * @param {number} maxRewrites
 * @returns {object}
 */
function profile(maxRewrites) {
  const candidate=mixInt32Functions(source,{sourceType:'commonjs',seed:'agent17/mba/v1',
    names:['kernel'],maxRewrites});
  const original=load(source),obfuscated=load(candidate.code);
  for(let warmup=0;warmup<8;warmup++){
    assert.equal(work(original,90000),work(obfuscated,90000));
  }
  /** @type {number[]} */ const native=[];
  /** @type {number[]} */ const mixed=[];
  for(let trial=0;trial<15;trial++){
    /** @type {Array<[(x:number,y:number)=>number,number[]]>} */
    const ordered=trial%2===0?[[original,native],[obfuscated,mixed]]:
      [[obfuscated,mixed],[original,native]];
    for(const [fn,samples] of ordered) {
      const start=performance.now();
      const output=work(/** @type {(x:number,y:number)=>number} */ (fn),300000);
      assert.ok(Number.isInteger(output));
      samples.push(performance.now()-start);
    }
  }
  const nativeMs=median(native),obfuscatedMs=median(mixed);
  return {maxRewrites,rewrites:candidate.rewrites,nativeMs,obfuscatedMs,
    ratio:obfuscatedMs/nativeMs,within2_5x:obfuscatedMs/nativeMs<=2.5,
    nativeSamplesMs:native,mixedSamplesMs:mixed,code:candidate.code};
}

if(require.main===module) {
  process.stdout.write(JSON.stringify({node:process.version,platform:process.platform,
    cases:[profile(1),profile(2)]},null,2)+'\n');
}

module.exports={profile};
