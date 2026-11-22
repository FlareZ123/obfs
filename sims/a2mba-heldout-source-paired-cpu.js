'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const vm=require('node:vm');
const esbuild=require('esbuild');
const {HashStream,SEED,emitCase,ATTACKER_COMMIT}=
  require('./a2mba-rotated-core-heldout');
const {recoverRotatedCoreSource}=require('./a2mba-rotated-core-static-recover');

/** @typedef {(count:number)=>number} WorkFn */
/** @typedef {{cpuMicros:number,result:number}} Sample */

/** @param {number[]} samples @returns {number} */
function median(samples) {
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Construct identical selected-work call loops in independent Node VM realms.
 * The function call occurs within the realm; no cross-realm call is charged
 * on each iteration.
 * @param {string} code
 * @param {string} kernelName
 * @returns {WorkFn}
 */
function loadWork(code,kernelName) {
  const loop='(function run(count){'+
    'let state=0x12345678|0;let sum=0;'+
    'for(let index=0;index<count;index++){'+
    'state=(Math.imul(state,1664525)+1013904223)|0;'+
    'sum=(sum+'+kernelName+'(state,index|0,(state^index)|0,Math.imul(state,0x45d9f3b)))|0;'+
    '}return sum|0;})';
  return /** @type {WorkFn} */ (vm.runInNewContext(code+'\n'+loop));
}

/** @param {WorkFn} work @param {number} count @returns {Sample} */
function sampleCpu(work,count) {
  const before=process.cpuUsage();
  const result=work(count);
  const elapsed=process.cpuUsage(before);
  return {cpuMicros:elapsed.user+elapsed.system,result};
}

/** @returns {Array<{index:number,rotation:number,source:string}>} */
function selectedHeldoutSources() {
  const stream=new HashStream(SEED);
  const indexes=new Set([0,9,18,27]);
  /** @type {Array<{index:number,rotation:number,source:string}>} */
  const selected=[];
  for(let index=0;index<32;index++){
    const item=emitCase(stream);
    if(indexes.has(index))selected.push({index,...item});
    stream.word(); // Same seed advancement as the 32-case frozen held-out suite.
  }
  assert.equal(selected.length,4);
  return selected;
}

/**
 * Matched input semantics and CPU accounting across direct native,
 * esbuild-minified native, and original published protected source.
 * Both cold VM compilation and minifier/build costs are excluded;
 * this is warmed selected-work CPU, not a full-session budget.
 *
 * @param {{count?:number,trials?:number}} [options]
 * @returns {{node:string,platform:string,count:number,trials:number,seed:string,
 *   attackerCommit:string,results:Array<{index:number,rotation:number,sourceSha256:string,
 *   nativeMedianMicros:number,minifiedMedianMicros:number,protectedMedianMicros:number,
 *   protectedToNativeMedian:number,protectedToMinifiedMedian:number,
 *   breachesNative:number,breachesMinified:number,maxNativePair:number,maxMinifiedPair:number,
 *   nativeSamples:number[],minifiedSamples:number[],protectedSamples:number[]}>}}
 */
function profileSourceCpu(options={}) {
  const count=options.count??20000000;
  const trials=options.trials??7;
  if(!Number.isSafeInteger(count)||count<1||
      !Number.isSafeInteger(trials)||trials<1)throw new TypeError('Positive integer count and trials required');
  /** @type {Array<{index:number,rotation:number,sourceSha256:string,nativeMedianMicros:number,
   * minifiedMedianMicros:number,protectedMedianMicros:number,protectedToNativeMedian:number,
   * protectedToMinifiedMedian:number,breachesNative:number,breachesMinified:number,
   * maxNativePair:number,maxMinifiedPair:number,nativeSamples:number[],
   * minifiedSamples:number[],protectedSamples:number[]}>} */
  const results=[];
  for(const example of selectedHeldoutSources()){
    const recovered=recoverRotatedCoreSource(example.source);
    assert.equal(recovered.rotation,example.rotation);
    const functionNames=[...example.source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\(/gm)];
    const targetName=functionNames.at(-1)?.[1];
    assert.ok(targetName);
    const originalSource=recovered.recoveredSource;
    const minifiedSource=esbuild.transformSync(originalSource,{
      target:'es2022',minify:true,format:'esm'
    }).code;
    const native=loadWork(originalSource,'recovered');
    const minified=loadWork(minifiedSource,'recovered');
    const protectedWork=loadWork(example.source,targetName);
    // Prewarm all three lanes and reject any source-level divergence.
    for(let warmup=0;warmup<4;warmup++){
      const expected=native(200000);
      assert.equal(minified(200000),expected);
      assert.equal(protectedWork(200000),expected);
    }
    /** @type {number[]} */
    const nativeSamples=[],minifiedSamples=[],protectedSamples=[];
    /** @type {number[]} */
    const relativeNative=[],relativeMinified=[];
    for(let trial=0;trial<trials;trial++){
      /** @type {{name:'native'|'minified'|'protected',fn:WorkFn}[]} */
      const variants=[
        {name:'native',fn:native},{name:'minified',fn:minified},
        {name:'protected',fn:protectedWork}
      ];
      const order=variants.slice(trial%3).concat(variants.slice(0,trial%3));
      /** @type {{native:number,minified:number,protected:number}} */
      const times={native:0,minified:0,protected:0};
      /** @type {number|null} */
      let checksum=null;
      for(const variant of order){
        const measured=sampleCpu(variant.fn,count);
        if(checksum===null)checksum=measured.result;
        else assert.equal(measured.result,checksum);
        times[variant.name]=measured.cpuMicros;
      }
      assert.ok(times.native>0&&times.minified>0&&times.protected>0);
      nativeSamples.push(times.native);
      minifiedSamples.push(times.minified);
      protectedSamples.push(times.protected);
      relativeNative.push(times.protected/times.native);
      relativeMinified.push(times.protected/times.minified);
    }
    results.push({
      index:example.index,rotation:example.rotation,
      sourceSha256:createHash('sha256').update(example.source).digest('hex'),
      nativeMedianMicros:median(nativeSamples),
      minifiedMedianMicros:median(minifiedSamples),
      protectedMedianMicros:median(protectedSamples),
      protectedToNativeMedian:median(protectedSamples)/median(nativeSamples),
      protectedToMinifiedMedian:median(protectedSamples)/median(minifiedSamples),
      breachesNative:relativeNative.filter(r=>r>2.5).length,
      breachesMinified:relativeMinified.filter(r=>r>2.5).length,
      maxNativePair:Math.max(...relativeNative),
      maxMinifiedPair:Math.max(...relativeMinified),
      nativeSamples,minifiedSamples,protectedSamples
    });
  }
  return {node:process.version,platform:process.platform,count,trials,seed:SEED,
    attackerCommit:ATTACKER_COMMIT,results};
}

if(require.main===module)console.log(JSON.stringify(profileSourceCpu(),null,2));
module.exports={selectedHeldoutSources,profileSourceCpu};
