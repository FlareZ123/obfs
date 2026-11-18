'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/** @param {number} start @param {number} count @returns {string} */
function chunkSource(start,count){
  let text="'use strict';\n";
  for(let i=start;i<start+count;i++){
    text+='const bag'+i+'={k:'+(i%23)+'};\n'+
      'function read'+i+'(){return "k" in bag'+i+' ? bag'+i+'.k : 0;}\n';
  }
  return text;
}

/** @param {number} count @returns {{native:string,emitted:string,properties:number}} */
function buildBundle(count){
  const nativeParts=[];
  const emittedParts=[];
  let properties=0;
  for(let start=0;start<count;start+=64){
    const size=Math.min(64,count-start);
    const native=chunkSource(start,size);
    const generated=obfuscateFiles([{
      path:'chunk'+start+'.cjs',code:native,sourceType:'commonjs'
    }],{
      mode:'coo',seed:'private-in-cold-'+start,
      strings:false,identifiers:false
    });
    const output=generated.files[0];
    assert.equal(output.metrics.properties,size,
      'Missing private-key rewrite: chunk '+start+' / '+count);
    nativeParts.push(native);
    emittedParts.push(/** @type {string} */ (output.code));
    properties+=output.metrics.properties;
  }
  // Deliberately package independently transformed CommonJS-scope chunks
  // into a single strict-mode function containing no identifier collisions.
  // The publisher could concatenate these exact generated source chunks.
  // This is a deployment-topology experiment, not a built-in bundle command.
  let calls='let total=0;for(let j=0;j<times;j++){';
  for(let i=0;i<count;i++)calls+='total+=read'+i+'();';
  calls+='}return total;';
  const suffix='return function session(times){'+calls+'};\n';
  return {
    native:"'use strict';\n"+nativeParts.join('\n')+suffix,
    emitted:"'use strict';\n"+emittedParts.join('\n')+suffix,
    properties
  };
}

/** @param {number[]} x @returns {number} */
function median(x){
  const sorted=[...x].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * A fresh compilation, initialization and optionally hot function calls.
 * Unique equal-length source suffixes suppress identical-source cache hits.
 *
 * @param {string} code
 * @param {number} calls
 * @param {number} iteration
 * @returns {number}
 */
function execute(code,calls,iteration){
  const run=/** @type {(times:number)=>number} */ (
    new Function(code+'\n/*sample-'+String(iteration).padStart(8,'0')+'*/')()
  );
  return run(calls);
}

/**
 * A single arm processes enough fresh compilations to resolve Windows'
 * coarse process CPU timer. Includes parse, execution and first-use.
 *
 * @param {string} code
 * @param {number} calls
 * @param {number} trial
 * @returns {{cpuUs:number,wallMs:number,checksum:number}}
 */
function sampleArm(code,calls,trial){
  const cpuStart=process.cpuUsage();
  const wallStart=performance.now();
  let checksum=0;
  for(let repetition=0;repetition<12;repetition++){
    checksum=(checksum+execute(code,calls,10000+trial*32+repetition)*(repetition+1))|0;
  }
  const wallMs=performance.now()-wallStart;
  const usage=process.cpuUsage(cpuStart);
  return {cpuUs:usage.user+usage.system,wallMs,checksum};
}

/**
 * @param {number} count
 * @param {number} calls
 * @param {{native:string,emitted:string,properties:number}} bundle
 * @returns {void}
 */
function profile(count,calls,bundle){
  assert.equal(bundle.properties,count);
  for(const n of [0,1,4,13]){
    assert.equal(execute(bundle.native,n,1),execute(bundle.emitted,n,1),
      'Native/emitted session mismatch, count '+count+' calls '+n);
  }
  for(let i=0;i<3;i++){
    sampleArm(bundle.native,calls,1000+i);
    sampleArm(bundle.emitted,calls,1000+i);
  }
  /** @type {number[]} */
  const nativeCpu=[],emittedCpu=[],nativeWall=[],emittedWall=[],pairedCpu=[];
  let wallBreaches=0;
  for(let trial=0;trial<13;trial++){
    const order=trial%2===0?['native','emitted']:['emitted','native'];
    /** @type {Record<string,ReturnType<typeof sampleArm>>} */
    const observations={};
    for(const arm of order){
      observations[arm]=sampleArm(arm==='native'?bundle.native:bundle.emitted,calls,trial);
    }
    const a=observations.native,b=observations.emitted;
    assert.equal(a.checksum,b.checksum,'Paired checksum mismatch');
    nativeCpu.push(a.cpuUs);
    emittedCpu.push(b.cpuUs);
    nativeWall.push(a.wallMs);
    emittedWall.push(b.wallMs);
    if(a.cpuUs>0&&b.cpuUs>0)pairedCpu.push(b.cpuUs/a.cpuUs);
    if(b.wallMs/a.wallMs>2.5)wallBreaches++;
  }
  const cpuRatio=median(emittedCpu)/median(nativeCpu);
  const wallRatio=median(emittedWall)/median(nativeWall);
  console.log('PRIVATE_IN_COLD_BUDGET '+JSON.stringify({
    node:process.version,platform:process.platform,objects:count,calls,
    declaredSourceChunks:Math.ceil(count/64),
    propertyRenames:bundle.properties,
    originalBytes:Buffer.byteLength(bundle.native),
    generatedBytes:Buffer.byteLength(bundle.emitted),
    trials:13,repetitionsPerTrialArm:12,
    medianOriginalCpuUs:median(nativeCpu),
    medianGeneratedCpuUs:median(emittedCpu),
    cpuRatioOfMedians:cpuRatio,
    strictCpuPairBreaches:pairedCpu.filter(x=>x>2.5).length,
    measurableCpuPairs:pairedCpu.length,
    cpuPairRatios:pairedCpu,
    medianOriginalWallMs:median(nativeWall),
    medianGeneratedWallMs:median(emittedWall),
    wallRatioOfMedians:wallRatio,
    strictWallPairBreaches:wallBreaches,
    boundary:'opt-in COO fixed-source concatenation, fresh Function compilation and session; excludes browser delivery, network, compiler build-time, and third-party code'
  }));
}

for(const count of [64,256,1024,4096]){
  const bundle=buildBundle(count);
  for(const calls of [0,1,64])profile(count,calls,bundle);
}
