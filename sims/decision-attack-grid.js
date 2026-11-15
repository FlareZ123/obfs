'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {transform}=require('../lib/transform');
const {virtualizeExpressionFunctions}=require('./expr-vm');
const {recoverExpressionVm}=require('./expr-vm-static-recover');
const {recoverObfuscatedStrings}=require('./static-string-recovery');
const {atomicWrite}=require('../src/atomic');

/** @typedef {Record<string,string>} Sources */

/** @returns {Sources} */
function workload() {
  return {
    'state.mjs':'export const state={secretField:"guarded-record-value"};'+
      'export function read(x){return x.secretField;}',
    'api.mjs':'import {state,read} from "./state.mjs";'+
      'export function numeric(x){return ((x+7)*3)^90;}'+
      'export function pure(n){let output=0;for(let i=0;i<n;i++)output^=numeric(i);return output;}'+
      'export function mixed(n,period){let output=0;for(let i=0;i<n;i++){'+
      'output+=read(state).length;output^=globalThis.window.externalValue(i);'+
      'if(i%period===0)output^=numeric(i);}return output;}',
    'entry.mjs':'import {performance} from "node:perf_hooks";'+
      'import {pure,mixed} from "./api.mjs";'+
      'globalThis.window={externalValue:x=>(Math.imul(x,17)%19)};'+
      'function median(a){return [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];}'+
      'function measure(fn){const firstStart=performance.now();const value=fn();'+
      'const firstCallMs=performance.now()-firstStart;'+
      'for(let warm=0;warm<5;warm++)fn();const times=[];'+
      'for(let trial=0;trial<9;trial++){const s=performance.now();'+
      'if(fn()!==value)throw Error("unstable value");times.push(performance.now()-s);}'+
      'return {value,firstCallMs,medianHotMs:median(times),samples:times};}'+
      'console.log(JSON.stringify({pure:measure(()=>pure(100000)),'+
      'mixed:measure(()=>mixed(100000,512))}));'
  };
}

/** @param {Sources} files @returns {string} */
function totalBytes(files) {
  return String(Object.values(files).reduce((n,code)=>n+Buffer.byteLength(code),0));
}

/**
 * Execute the same ESM application with its native Node linker.
 * The process wall measurement includes startup, loading, and both benchmarks.
 * @param {Sources} files
 * @returns {Promise<{data:any,wallMs:number}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-decision-grid-'));
  try {
    for(const [name,code] of Object.entries(files))
      await atomicWrite(path.join(directory,name),code);
    const start=performance.now();
    const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:30000
    });
    const wallMs=performance.now()-start;
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return {data:JSON.parse(child.stdout),wallMs};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @param {Sources} files @returns {string} */
function hashFiles(files) {
  const digest=createHash('sha256');
  for(const key of Object.keys(files).sort())digest.update(key+'\0'+files[key]+'\0');
  return digest.digest('hex');
}

/** @param {any} measured @param {any} baseline */
function ratios(measured,baseline) {
  return {
    pureHot:measured.data.pure.medianHotMs/baseline.data.pure.medianHotMs,
    mixedHot:measured.data.mixed.medianHotMs/baseline.data.mixed.medianHotMs,
    coldProcessWall:measured.wallMs/baseline.wallMs
  };
}

/** @returns {Promise<void>} */
async function main() {
  const source=workload();
  const baseline=await execute(source);
  const literal='guarded-record-value';
  /** @type {any[]} */
  const rows=[];
  for(const seed of ['holdout-1','holdout-2','holdout-3']) {
    const mainTransform=obfuscateFiles(Object.entries(source).map(([name,code])=>({
      path:name,sourceType:'module',code
    })),{mode:'coo',closedWorld:true,strings:true,identifiers:false,seed});
    /** @type {Sources} */
    const mainFiles=Object.fromEntries(mainTransform.files.map(file=>[file.path,/** @type {string} */ (file.code)]));
    const libTransform=transform(source,{seed,closedWorld:true});
    const vm=virtualizeExpressionFunctions(source['api.mjs'],'module',{seed,names:['numeric']});
    const vmFiles={...source,'api.mjs':vm.code};
    /** @type {Array<{name:string,files:Sources,coverage:any,attack:any}>} */
    const variants=[
      {
        name:'main-src',
        files:mainFiles,
        coverage:{properties:mainTransform.crossFile.properties,
          strings:mainTransform.files.reduce((n,item)=>n+item.metrics.literals,0)},
        attack:{literal:recoverObfuscatedStrings(mainFiles['state.mjs'],'module')}
      },
      {
        name:'lib-checker',
        files:libTransform.files,
        coverage:{properties:libTransform.renamed,diagnostics:libTransform.diagnostics},
        attack:{}
      },
      {
        name:'experimental-expr-vm',
        files:vmFiles,
        coverage:{functions:vm.functions,instructions:vm.instructions,declined:vm.declined},
        attack:{}
      }
    ];
    for(const variant of variants) {
      const observed=await execute(variant.files);
      assert.deepEqual({
        pure:observed.data.pure.value,mixed:observed.data.mixed.value
      },{
        pure:baseline.data.pure.value,mixed:baseline.data.mixed.value
      },'Semantic mismatch: '+variant.name+' / '+seed);
      const recovered=variant.name==='main-src'
        ? /** @type {ReturnType<typeof recoverObfuscatedStrings>} */(variant.attack.literal).code
        : variant.files['state.mjs'];
      const literalRecovered=recovered.includes(literal);
      /** @type {{success:boolean,expression?:string,error?:string}} */
      let vmAttack={success:false};
      if(variant.name==='experimental-expr-vm') {
        try {
          const recovery=recoverExpressionVm(variant.files['api.mjs'],'numeric','module');
          const candidate=new Function('x','return '+recovery.expression);
          const correct=/** @type {(x:number)=>number} */(candidate);
          vmAttack={success:Array.from({length:100},(_,i)=>i*773-31001)
            .every(x=>correct(x)===(((x+7)*3)^90)),expression:recovery.expression};
        }catch(error){
          vmAttack={success:false,error:String(error)};
        }
      }
      const row={
        seed,variant:variant.name,sourceHash:hashFiles(source),
        outputBytes:Number(totalBytes(variant.files)),
        baselineBytes:Number(totalBytes(source)),
        coverage:variant.coverage,
        nativeBehaviorEquivalent:true,
        runtimeRatios:ratios(observed,baseline),
        runtimeMs:{
          baselinePure:baseline.data.pure.medianHotMs,
          obfuscatedPure:observed.data.pure.medianHotMs,
          baselineMixed:baseline.data.mixed.medianHotMs,
          obfuscatedMixed:observed.data.mixed.medianHotMs
        },
        attack:{
          staticLiteralRecoverySuccess:literalRecovered,
          numericKernelRecoveredFromPublicVM:variant.name==='experimental-expr-vm'?vmAttack:null,
          // For non-VM variants the protected numeric source is plain JS.
          numericSourceStillPlaintext:variant.name!=='experimental-expr-vm'&&
            variant.files['api.mjs'].includes('((x+7)*3)^90')
        }
      };
      rows.push(row);
    }
  }
  const report={
    date:new Date().toISOString(),
    node:process.version,
    platform:process.platform,
    cpu:os.cpus()[0]?.model,
    testContract:'identical 3-file ESM graph; browser-like window API supplied via explicit global',
    originalSha256:hashFiles(source),
    baseline:{pure:baseline.data.pure,mixed:baseline.data.mixed,
      processWallMs:baseline.wallMs,bytes:Number(totalBytes(source))},
    seeds:3,
    rows,
    decision:'VM only experimental; require <=2.5x isolated pure-hot and attacker failure before promoting'
  };
  await atomicWrite(path.join(process.cwd(),'decision-grid-output.json'),JSON.stringify(report,null,2)+'\n');
  for(const row of rows) {
    process.stdout.write(JSON.stringify({
      seed:row.seed,variant:row.variant,coverage:row.coverage,
      equivalent:row.nativeBehaviorEquivalent,ratios:row.runtimeRatios,
      attack:row.attack,outputBytes:row.outputBytes
    })+'\n');
  }
}

main().catch(error=>{process.stderr.write(String(error?.stack||error)+'\n');process.exitCode=1;});
