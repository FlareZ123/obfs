'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src/core');
const {reconstructPublicWasmEsm}=require('./wasm-i32-esm-native-rebuild');
const {pairedBudgetBound}=require('./paired-budget-bound');

/** @typedef {'native'|'emitted'|'reconstructed'} Variant */
/** @typedef {{path:string,code:string}} File */
/** @typedef {File[]} Graph */
/** @typedef {{a:number,b:number,c:number,d:number,label:string}} InputRecord */
/** @typedef {{ms:number,outputHash:string,callbackHash:string,callbacks:number}} Session */

// Public label inputs are strings; ESM entry never coerces a function value
// to a string, allowing the compiler's cross-file source-observer guard.
/** @type {Graph} */
const original=[
  {path:'kernel.mjs',
    code:'export function scramble(a,b,c,d){return (((a^b)&(c|d))^((a>>>d)|(c<<b)));}'+
      'export function mask(x){return x?((x^137)&255):((~x)|7);}'},
  {path:'bridge.mjs',
    code:'export function forward(value,label){return globalThis.externalBridge.deliver(value,label);}'},
  {path:'entry.mjs',
    code:'import {scramble,mask} from "./kernel.mjs";import {forward} from "./bridge.mjs";'+
      'export function run(a,b,c,d,label){return forward((scramble(a,b,c,d)^mask(a))|0,label);}'}
];

/** @param {string} value @returns {string} */
function sha256(value){return createHash('sha256').update(value).digest('hex');}

/** @param {number} count @returns {InputRecord[]} */
function records(count){
  const boundaries=[-2147483648,-1,0,1,31,32,2147483647,0x12345678];
  return Array.from({length:count},(_,i)=>({
    a:i<boundaries.length?boundaries[i]:(Math.imul(i^0x9bf34621,0x9e3779b1)|0),
    b:Math.imul(i+71,1664525)|0,
    c:Math.imul(i+149,1013904223)|0,
    d:(i>>>3)&31,
    label:'event-'+i+(i%47===0?'終':'')
  }));
}

/** @param {string} folder @param {Graph} graph @returns {Promise<void>} */
async function materialize(folder,graph){
  for(const file of graph)await atomicWrite(path.join(folder,file.path),file.code);
}

/** @param {string} folder @param {InputRecord[]} input @returns {Promise<Session>} */
async function execute(folder,input){
  /** @type {{value:number,label:string}[]} */
  const observed=[];
  (/** @type {any} */ (globalThis)).externalBridge={
    /** @param {number} value @param {string} label @returns {string} */
    deliver(value,label){
      observed.push({value,label});
      return label+':'+(value>>>0).toString(16);
    }
  };
  /** @type {string[]} */
  const outputs=[];
  const start=performance.now();
  const app=/** @type {{run:(a:number,b:number,c:number,d:number,label:string)=>string}} */(
    await import(pathToFileURL(path.join(folder,'entry.mjs')).href));
  for(const record of input)outputs.push(app.run(record.a,record.b,record.c,record.d,record.label));
  const ms=performance.now()-start;
  assert.ok(Number.isFinite(ms)&&ms>0);
  return {
    ms,outputHash:sha256(JSON.stringify(outputs)),
    callbackHash:sha256(JSON.stringify(observed)),callbacks:observed.length
  };
}

/**
 * Same graph, three delivered variants, fresh ESM directories per trial.
 * Cold includes ESM parse, evaluation and selected Wasm initialization.
 * Process creation, input preparation, build/attack, filesystem writes,
 * network delivery and post-run digest calculation are outside this timing.
 *
 * @returns {Promise<object>}
 */
async function run(){
  const emittedResult=obfuscateFiles(original.map(file=>({
    ...file,sourceType:/** @type {'module'} */('module')
  })),{
    mode:'coo',seed:'i32-esm-rebuild-profile',closedWorld:true,
    properties:false,identifiers:false,strings:false,
    experimentalWasmI32:{'kernel.mjs':['scramble','mask']}
  });
  /** @type {Graph} */
  const emitted=emittedResult.files.map(file=>({path:file.path,code:String(file.code)}));
  const selected=emitted.find(file=>file.path==='kernel.mjs');
  assert.ok(selected);
  assert.equal(emittedResult.files.find(file=>file.path==='kernel.mjs')?.metrics.wasmI32Functions,2);
  const recovered=reconstructPublicWasmEsm(selected.code);
  assert.equal(recovered.functions.length,2);
  const reconstructed=emitted.map(file=>file.path==='kernel.mjs'?
    {path:file.path,code:recovered.code}:file);
  /** @type {Record<Variant,Graph>} */
  const graphs={native:original,emitted,reconstructed};
  /** @type {Variant[]} */
  const variants=['native','emitted','reconstructed'];
  /** @type {Variant[][]} */
  const orders=[
    ['native','emitted','reconstructed'],
    ['reconstructed','native','emitted'],
    ['emitted','reconstructed','native']
  ];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wasm-rebuild-profile-'));
  const priorBridge=/** @type {any} */(globalThis).externalBridge;
  /** @type {object[]} */
  const rows=[];
  try{
    for(const count of [1,50,1000,10000]){
      const input=records(count);
      /** @type {Record<Variant,number[]>} */
      const timings={native:[],emitted:[],reconstructed:[]};
      for(let trial=0;trial<9;trial++){
        /** @type {Session|undefined} */
        let reference;
        for(const variant of orders[trial%orders.length]){
          const folder=path.join(root,variant+'-'+count+'-'+trial);
          await materialize(folder,graphs[variant]);
          const observed=await execute(folder,input);
          if(!reference)reference=observed;
          assert.equal(observed.callbacks,count);
          assert.equal(observed.outputHash,reference.outputHash);
          assert.equal(observed.callbackHash,reference.callbackHash);
          timings[variant].push(observed.ms);
        }
      }
      rows.push({calls:count,trialPairs:9,
        emittedVsNative:pairedBudgetBound(timings.native,timings.emitted),
        reconstructedVsNative:pairedBudgetBound(timings.native,timings.reconstructed),
        timingMs:timings});
    }
    /** @type {Record<Variant,number>} */
    const sourceBytes={native:0,emitted:0,reconstructed:0};
    for(const variant of variants)
      sourceBytes[variant]=graphs[variant].reduce((sum,file)=>sum+Buffer.byteLength(file.code),0);
    return {node:process.version,platform:process.platform,seed:'i32-esm-rebuild-profile',
      contract:'two pure i32 exported kernels, unchanged external bridge and ESM entry',
      sourceBytes,recoveredFunctions:recovered.functions.length,
      coldScope:'unique filesystem ESM graphs per trial, reused Node process, no process startup or disk writes',
      rows};
  }finally{
    (/** @type {any} */(globalThis)).externalBridge=priorBridge;
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module)run().then(result=>{
  process.stdout.write('WASM_ESM_NATIVE_REBUILD_PROFILE '+JSON.stringify(result)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={run};
