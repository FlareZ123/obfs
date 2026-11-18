'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/** @param {number} first @param {number} count @returns {string} */
function chunk(first,count){
  let source="'use strict';\n";
  for(let i=first;i<first+count;i++){
    source+='const b'+i+'={k:'+(i%23)+'};'+
      'if("k" in b'+i+')total=(total+b'+i+'.k)|0;\n';
  }
  return source;
}

/**
 * Compiler-generated CommonJS-compatible top-level chunks are inserted into
 * one source text with disjoint lexical declarations. The native and emitted
 * bundles are assembled in exactly the same order.
 * @param {number} size
 * @returns {{native:string,generated:string,properties:number}}
 */
function build(size){
  /** @type {string[]} */
  const original=[];
  /** @type {string[]} */
  const published=[];
  let properties=0;
  for(let first=0;first<size;first+=64){
    const native=chunk(first,Math.min(64,size-first));
    const out=obfuscateFiles([{
      path:'immediate'+first+'.cjs',sourceType:'commonjs',code:native
    }],{
      mode:'coo',seed:'in-immediate-'+first,
      identifiers:false,strings:false
    });
    assert.equal(out.files[0].metrics.properties,Math.min(64,size-first));
    properties+=out.files[0].metrics.properties;
    original.push(native);
    published.push(/** @type {string} */ (out.files[0].code));
  }
  const prefix="'use strict';let total=0;\n";
  const suffix="\nreturn total;\n";
  return {
    native:prefix+original.join('\n')+suffix,
    generated:prefix+published.join('\n')+suffix,
    properties
  };
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {string} code
 * @param {number} trial
 * @returns {{cpuUs:number,wallMs:number,output:number}}
 */
function sample(code,trial){
  const cpuStart=process.cpuUsage();
  const wallStart=performance.now();
  let output=0;
  for(let i=0;i<12;i++){
    const salted=code+'\n/*fresh-'+String(trial*32+i).padStart(8,'0')+'*/';
    output=(output+/** @type {number} */ (new Function(salted)())*(i+1))|0;
  }
  const diff=process.cpuUsage(cpuStart);
  return {
    cpuUs:diff.user+diff.system,
    wallMs:performance.now()-wallStart,
    output
  };
}

/** @param {number} objects @returns {void} */
function profile(objects){
  const pair=build(objects);
  assert.equal(pair.properties,objects);
  for(const n of [1,2,9]){
    assert.equal(sample(pair.native,n).output,sample(pair.generated,n).output);
  }
  for(let warm=0;warm<3;warm++){
    sample(pair.native,1000+warm);
    sample(pair.generated,1000+warm);
  }
  /** @type {number[]} */
  const originalCpu=[],publishedCpu=[],originalWall=[],publishedWall=[],cpuPairs=[];
  let wallBreaches=0;
  for(let trial=0;trial<13;trial++){
    const first=trial%2===0?sample(pair.native,trial):sample(pair.generated,trial);
    const second=trial%2===0?sample(pair.generated,trial):sample(pair.native,trial);
    const native=trial%2===0?first:second;
    const generated=trial%2===0?second:first;
    assert.equal(native.output,generated.output);
    originalCpu.push(native.cpuUs); publishedCpu.push(generated.cpuUs);
    originalWall.push(native.wallMs);publishedWall.push(generated.wallMs);
    if(native.cpuUs>0&&generated.cpuUs>0)cpuPairs.push(generated.cpuUs/native.cpuUs);
    if(generated.wallMs/native.wallMs>2.5)wallBreaches++;
  }
  console.log('PRIVATE_IN_IMMEDIATE_COLD '+JSON.stringify({
    platform:process.platform,node:process.version,objects,
    sourceChunks:Math.ceil(objects/64),actualPrivateFieldRenames:pair.properties,
    nativeBytes:Buffer.byteLength(pair.native),generatedBytes:Buffer.byteLength(pair.generated),
    comparisons:13,compilationsPerArm:12,
    medianNativeCpuUs:median(originalCpu),medianGeneratedCpuUs:median(publishedCpu),
    medianCpuRatio:median(publishedCpu)/median(originalCpu),
    cpuBreaches:cpuPairs.filter(x=>x>2.5).length,measurableCpuPairs:cpuPairs.length,
    cpuPairRatios:cpuPairs,
    medianNativeWallMs:median(originalWall),medianGeneratedWallMs:median(publishedWall),
    medianWallRatio:median(publishedWall)/median(originalWall),
    wallBreaches,
    boundary:'COO fresh Function compilation and immediate own-key top-level work; manual bundle of actual separately compiled chunks, no browser/network, no repeated session work'
  }));
}

for(const n of [64,256,1024,4096,8192])profile(n);
