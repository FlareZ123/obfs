'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {reconstructPublicMath}=require('./polyvariant-app-static-clone');

/** @typedef {{kind:string,payload:string}[]} Records */
/** @typedef {{runScenario:(seed:number,records:Records,host:{emit:(value:unknown)=>void})=>string}} Program */
/** @typedef {{round1:(x:number)=>number,round2:(x:number)=>number,round3:(x:number)=>number}} Arithmetic */

/** @param {string} value @returns {string} */
function sha(value){return createHash('sha256').update(value).digest('hex');}

/** @returns {number[]} */
function typedInputs(){
  const values=[-2147483648,-2147483647,-1,-0,0,1,2147483646,2147483647];
  let state=0x3bf417dd;
  for(let i=0;i<512;i++){
    state=(Math.imul(state,1664525)+1013904223)|0;
    values.push(state);
  }
  return values;
}

/** @param {number} seed @param {number} count @returns {Records} */
function records(seed,count){
  return Array.from({length:count},(_,index)=>({
    kind:['open','stop','pause','resume','tick','終'][(index+seed)%6],
    payload:'event-'+seed+'-'+index+(index%3===0?'β':'')+(index%7===0?'🧪':'')
  }));
}

/**
 * @param {Program} fn
 * @param {number} initial
 * @param {Records} input
 * @returns {{result:string,trace:unknown[]}}
 */
function observe(fn,initial,input){
  /** @type {unknown[]} */
  const trace=[];
  const result=fn.runScenario(initial,input,{emit(value){trace.push(value);}});
  return {result,trace};
}

/**
 * @param {string} folder
 * @param {string} math
 * @param {{path:string,code:string}[]} publicRest
 * @returns {Promise<{app:Program,math:Arithmetic}>}
 */
async function loadGraph(folder,math,publicRest){
  await atomicWrite(path.join(folder,'math.mjs'),math);
  for(const file of publicRest)await atomicWrite(path.join(folder,file.path),file.code);
  return {
    app:/** @type {Program} */(await import(pathToFileURL(path.join(folder,'entry.mjs')).href)),
    math:/** @type {Arithmetic} */(await import(pathToFileURL(path.join(folder,'math.mjs')).href))
  };
}

/**
 * Blind, fixed-seed reproducibility matrix. The recovering adversary receives
 * strictly the emitted source, never native math or the compiler's seed.
 * The original program is consulted only by this independent verifier.
 * @returns {Promise<{compilerSeeds:number,variantHashes:number,recoveredFunctions:number,typedChecks:number,statefulSessions:number,hostEvents:number,attackerMs:{median:number,min:number,max:number},publishedBytes:{min:number,max:number},recoveredBytes:{min:number,max:number},node:string,platform:NodeJS.Platform}>}
 */
async function runEvidence(){
  const sourceFolder=path.join(__dirname,'../examples/polyvariant-app/native');
  const nativeMath=(await fs.readFile(path.join(sourceFolder,'math.mjs'),'utf8')).replace(/\r\n/g,'\n');
  const publicRest=await Promise.all(['state.mjs','entry.mjs'].map(async file=>({
    path:file,code:(await fs.readFile(path.join(sourceFolder,file),'utf8')).replace(/\r\n/g,'\n')
  })));
  const nativeApp=/** @type {Program} */(await import(pathToFileURL(path.join(sourceFolder,'entry.mjs')).href));
  const nativeArithmetic=/** @type {Arithmetic} */(await import(pathToFileURL(path.join(sourceFolder,'math.mjs')).href));
  const numbers=typedInputs();
  const outputDigests=new Set();
  let recoveredFunctions=0,typedChecks=0,statefulSessions=0,hostEvents=0;
  /** @type {number[]} */
  const attackerMs=[];
  /** @type {number[]} */
  const publishedBytes=[];
  /** @type {number[]} */
  const recoveredBytes=[];
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-polyvariant-seed-matrix-'));
  try{
    for(let seedIndex=0;seedIndex<24;seedIndex++){
      // Stable, unambiguous independent build inputs; the attack never gets the seed.
      const compilationSeed=sha('blind-public-source-challenge/20261117/'+seedIndex);
      const published=obfuscateFiles([{path:'math.mjs',sourceType:'module',code:nativeMath}],{
        mode:'coo',seed:compilationSeed,closedWorld:false,strings:false,
        experimentalPolyvariantAffine:{'math.mjs':['round1','round2','round3']},
        experimentalPolyvariantCount:2
      });
      assert.equal(published.files[0].metrics.polyvariantFunctions,3);
      const publicMath=/** @type {string} */(published.files[0].code);
      outputDigests.add(sha(publicMath));
      const started=performance.now();
      const recovered=reconstructPublicMath(publicMath);
      attackerMs.push(performance.now()-started);
      assert.equal(recovered.functions.length,3);
      assert.ok(recovered.functions.every(entry=>entry.paths===2));
      assert.notEqual(recovered.code,publicMath);
      recoveredFunctions+=recovered.functions.length;
      publishedBytes.push(Buffer.byteLength(publicMath));
      recoveredBytes.push(Buffer.byteLength(recovered.code));
      const publicGraph=await loadGraph(path.join(temporary,'public-'+seedIndex),publicMath,publicRest);
      const recoveredGraph=await loadGraph(path.join(temporary,'recovered-'+seedIndex),recovered.code,publicRest);
      for(const name of /** @type {const} */(['round1','round2','round3'])){
        for(const value of numbers){
          const expected=nativeArithmetic[name](value);
          assert.ok(Object.is(publicGraph.math[name](value),expected),
            'Emitted arithmetic changed at build '+seedIndex+'/'+name+'/'+value);
          assert.ok(Object.is(recoveredGraph.math[name](value),expected),
            'Independent recovery changed at build '+seedIndex+'/'+name+'/'+value);
          typedChecks++;
        }
      }
      for(let caseIndex=0;caseIndex<32;caseIndex++){
        const count=1+(seedIndex*19+caseIndex*37)%37;
        const input=records(seedIndex+caseIndex,count);
        const initial=(Math.imul(seedIndex+3,0x9e3779b1)+caseIndex)|0;
        const expected=observe(nativeApp,initial,input);
        assert.deepEqual(observe(publicGraph.app,initial,input),expected,
          'Distributed graph changed state/trace at build '+seedIndex+'/'+caseIndex);
        assert.deepEqual(observe(recoveredGraph.app,initial,input),expected,
          'Rebuilt graph changed state/trace at build '+seedIndex+'/'+caseIndex);
        assert.equal(expected.trace.length,count);
        statefulSessions++;
        hostEvents+=count;
      }
    }
  }finally{
    await fs.rm(temporary,{recursive:true,force:true});
  }
  assert.equal(outputDigests.size,24,'Compiler seeds should create 24 different public math distributions');
  assert.equal(recoveredFunctions,72);
  assert.equal(statefulSessions,24*32);
  const sorted=[...attackerMs].sort((a,b)=>a-b);
  return {
    compilerSeeds:24,variantHashes:outputDigests.size,recoveredFunctions,
    typedChecks,statefulSessions,hostEvents,
    attackerMs:{min:sorted[0],median:(sorted[11]+sorted[12])/2,max:sorted[23]},
    publishedBytes:{min:Math.min(...publishedBytes),max:Math.max(...publishedBytes)},
    recoveredBytes:{min:Math.min(...recoveredBytes),max:Math.max(...recoveredBytes)},
    node:process.version,platform:process.platform
  };
}

/** @returns {Promise<void>} */
async function main(){
  const result=await runEvidence();
  process.stdout.write('POLYVARIANT_HELDOUT_SEED_STATIC_RECOVERY '+JSON.stringify(result)+'\n');
}
if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={runEvidence};
