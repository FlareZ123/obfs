'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/** @param {number} objects @returns {string} */
function original(objects){
  let source="'use strict';let total=0;\n";
  for(let i=0;i<objects;i++){
    source+='const bag'+i+'={k:'+(i%31)+'};'+
      'if("k" in bag'+i+')total=(total+bag'+i+'.k)|0;\n';
  }
  return source+'module.exports=total;\n';
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Compile and evaluate exactly the supplied CommonJS file in a fresh module.
 * This includes first-use compilation and execution, with identical input to
 * native/generated and a changed fixed-width comment to avoid source caches.
 *
 * @param {string} source
 * @param {number} trial
 * @returns {{cpuUs:number,wallMs:number,checksum:number}}
 */
function sample(source,trial){
  const start=process.cpuUsage();
  const wall=performance.now();
  let checksum=0;
  for(let i=0;i<12;i++){
    /** @type {{exports:number|null}} */
    const module={exports:null};
    new Function('module',source+'/*'+String(trial*64+i).padStart(9,'0')+'*/')(module);
    assert.equal(typeof module.exports,'number');
    checksum=(checksum+/** @type {number} */ (module.exports)*(i+1))|0;
  }
  const elapsed=process.cpuUsage(start);
  return {
    cpuUs:elapsed.user+elapsed.system,
    wallMs:performance.now()-wall,checksum
  };
}

/** @param {number} objects @returns {void} */
function profile(objects){
  const native=original(objects);
  const generated=obfuscateFiles([{
    path:'onefile.cjs',code:native,sourceType:'commonjs'
  }],{
    mode:'coo',seed:'own-in-onefile-'+objects,strings:false,identifiers:false
  });
  const emitted=/** @type {string} */ (generated.files[0].code);
  assert.equal(generated.files[0].metrics.properties,objects,
    'One-file compiler did not transform every proved field');
  assert.equal(sample(native,2).checksum,sample(emitted,2).checksum);
  for(let i=0;i<3;i++){
    sample(native,2000+i);
    sample(emitted,2000+i);
  }
  /** @type {number[]} */
  const nc=[],gc=[],nw=[],gw=[],pairs=[];
  let wallBreaches=0;
  for(let trial=0;trial<13;trial++){
    const first=trial%2===0?sample(native,trial):sample(emitted,trial);
    const second=trial%2===0?sample(emitted,trial):sample(native,trial);
    const originalRun=trial%2===0?first:second;
    const generatedRun=trial%2===0?second:first;
    assert.equal(originalRun.checksum,generatedRun.checksum);
    nc.push(originalRun.cpuUs);gc.push(generatedRun.cpuUs);
    nw.push(originalRun.wallMs);gw.push(generatedRun.wallMs);
    if(originalRun.cpuUs>0&&generatedRun.cpuUs>0)
      pairs.push(generatedRun.cpuUs/originalRun.cpuUs);
    if(generatedRun.wallMs/originalRun.wallMs>2.5)wallBreaches++;
  }
  console.log('PRIVATE_IN_ONEFILE_COLD '+JSON.stringify({
    node:process.version,platform:process.platform,objects,
    actualPropertyRenames:generated.files[0].metrics.properties,
    nativeBytes:Buffer.byteLength(native),generatedBytes:Buffer.byteLength(emitted),
    trials:13,compilationsPerArm:12,
    cpuMedianNativeUs:median(nc),cpuMedianGeneratedUs:median(gc),
    cpuRatioOfMedians:median(gc)/median(nc),
    strictCpuPairBreaches:pairs.filter(x=>x>2.5).length,
    measurableCpuPairs:pairs.length,cpuPairs:pairs,
    wallMedianNativeMs:median(nw),wallMedianGeneratedMs:median(gw),
    wallRatioOfMedians:median(gw)/median(nw),strictWallPairBreaches:wallBreaches,
    scope:'exact compiler-generated standalone COO CommonJS, parse + first evaluation, no transport, excludes build compiler time and extended sessions'
  }));
}

for(const n of [64,256,512,1024,2048])profile(n);
