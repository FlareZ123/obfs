'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {transform}=require('esbuild');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src/core');
const {reconstructPublicWasmEsm}=require('./wasm-i32-esm-native-rebuild');
const {pairedBudgetBound}=require('./paired-budget-bound');

/** @typedef {'native'|'minified'|'wasm'|'reconstructed'} Variant */
/** @typedef {{path:string,code:string}} File */
/** @typedef {File[]} Graph */
/** @typedef {{a:number,b:number,c:number,d:number,label:string}} RecordInput */
/** @typedef {{importMs:number,workMs:number,totalMs:number,outputHash:string,callbackHash:string,callbacks:number}} Session */
/** @typedef {{native:number[],minified:number[],wasm:number[],reconstructed:number[]}} Times */

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

/** @param {string} text @returns {string} */
function sha256(text){return createHash('sha256').update(text).digest('hex');}

/** @param {Graph} graph @returns {string} */
function graphHash(graph){
  return sha256(graph.map(file=>file.path+'\0'+file.code+'\0').join(''));
}

/** @param {number} count @returns {RecordInput[]} */
function records(count){
  const boundaries=[-2147483648,-1,0,1,31,32,2147483647,0x12345678];
  return Array.from({length:count},(_,i)=>({
    a:i<boundaries.length?boundaries[i]:Math.imul(i^0x9bf34621,0x9e3779b1)|0,
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

/**
 * Measure import/evaluation and then application work separately.
 * Process startup, file materialization, graph construction, and digest
 * calculations stay outside both timed regions.
 * @param {string} folder
 * @param {RecordInput[]} inputs
 * @returns {Promise<Session>}
 */
async function execute(folder,inputs){
  /** @type {{value:number,label:string}[]} */
  const observed=[];
  (/** @type {any} */(globalThis)).externalBridge={
    /** @param {number} value @param {string} label @returns {string} */
    deliver(value,label){
      observed.push({value,label});
      return label+':'+(value>>>0).toString(16);
    }
  };
  const start=performance.now();
  const app=/** @type {{run:(a:number,b:number,c:number,d:number,label:string)=>string}} */ (
    await import(pathToFileURL(path.join(folder,'entry.mjs')).href));
  const imported=performance.now();
  /** @type {string[]} */
  const outputs=[];
  for(const record of inputs)
    outputs.push(app.run(record.a,record.b,record.c,record.d,record.label));
  const finished=performance.now();
  const importMs=imported-start,workMs=finished-imported;
  assert.ok(importMs>0&&workMs>0);
  return {
    importMs,workMs,totalMs:finished-start,
    outputHash:sha256(JSON.stringify(outputs)),
    callbackHash:sha256(JSON.stringify(observed)),
    callbacks:observed.length
  };
}

/**
 * Compare four same-trust delivered ESM graphs. The reconstructed variant is
 * created solely from the public Wasm artifact, without the trusted original
 * source. The original is used after construction only to verify parity.
 * @returns {Promise<{graphs:Record<Variant,Graph>,recoveredFunctions:number}>}
 */
async function prepare(){
  const native=original;
  /** @type {Graph} */
  const minified=await Promise.all(native.map(async file=>({
    path:file.path,
    code:(await transform(file.code,{
      format:'esm',loader:'js',target:'es2022',minify:true,
      legalComments:'none',sourcefile:file.path
    })).code
  })));
  const compiled=obfuscateFiles(native.map(file=>({
    ...file,sourceType:/** @type {'module'} */('module')
  })),{
    mode:'coo',seed:'i32-four-way-minified-20261121',closedWorld:true,
    properties:false,identifiers:false,strings:false,
    experimentalWasmI32:{'kernel.mjs':['scramble','mask']}
  });
  assert.equal(compiled.files.find(file=>file.path==='kernel.mjs')?.metrics.wasmI32Functions,2);
  /** @type {Graph} */
  const wasm=compiled.files.map(file=>({path:file.path,code:String(file.code)}));
  const kernel=wasm.find(file=>file.path==='kernel.mjs');
  assert.ok(kernel);
  const recovered=reconstructPublicWasmEsm(kernel.code);
  assert.equal(recovered.functions.length,2);
  const reconstructed=wasm.map(file=>file.path==='kernel.mjs'?
    {path:file.path,code:recovered.code}:file);
  return {graphs:{native,minified,wasm,reconstructed},recoveredFunctions:2};
}

/**
 * Full callback and output equivalence with rotating measurement order.
 * Each ESM graph gets a unique directory per trial, avoiding import cache
 * reuse. Reusing one Node process still permits JIT/OS cache interaction.
 * @returns {Promise<object>}
 */
async function run(){
  const {graphs,recoveredFunctions}=await prepare();
  /** @type {Variant[]} */
  const variants=['native','minified','wasm','reconstructed'];
  /** @type {Variant[][]} */
  const orders=[
    ['native','minified','wasm','reconstructed'],
    ['reconstructed','wasm','minified','native'],
    ['minified','native','reconstructed','wasm'],
    ['wasm','reconstructed','native','minified']
  ];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wasm-four-way-'));
  const oldBridge=(/** @type {any} */(globalThis)).externalBridge;
  /** @type {object[]} */
  const rows=[];
  try{
    for(const count of [1,50,1000,10000]){
      const input=records(count);
      /** @type {{import:Times,work:Times,total:Times}} */
      const times={
        import:{native:[],minified:[],wasm:[],reconstructed:[]},
        work:{native:[],minified:[],wasm:[],reconstructed:[]},
        total:{native:[],minified:[],wasm:[],reconstructed:[]}
      };
      for(let trial=0;trial<12;trial++){
        /** @type {Record<Variant,string>} */
        const folders={native:'',minified:'',wasm:'',reconstructed:''};
        for(const variant of variants){
          const folder=path.join(root,variant+'-'+count+'-'+trial);
          await materialize(folder,graphs[variant]);
          folders[variant]=folder;
        }
        /** @type {Session|undefined} */
        let reference;
        for(const variant of orders[trial%orders.length]){
          const observed=await execute(folders[variant],input);
          assert.equal(observed.callbacks,count,'callback count '+variant+'/'+count);
          if(reference){
            assert.equal(observed.outputHash,reference.outputHash,
              'full output trace mismatch '+variant+'/'+count);
            assert.equal(observed.callbackHash,reference.callbackHash,
              'external callback trace mismatch '+variant+'/'+count);
          }else reference=observed;
          times.import[variant].push(observed.importMs);
          times.work[variant].push(observed.workMs);
          times.total[variant].push(observed.totalMs);
        }
      }
      const comparisons=/** @type {const} */(['total','work']);
      rows.push({calls:count,pairs:12,
        wasmVsNativeTotal:pairedBudgetBound(times.total.native,times.total.wasm),
        wasmVsMinifiedTotal:pairedBudgetBound(times.total.minified,times.total.wasm),
        wasmVsNativeWork:pairedBudgetBound(times.work.native,times.work.wasm),
        wasmVsMinifiedWork:pairedBudgetBound(times.work.minified,times.work.wasm),
        observedWasmOver2_5xNative:{
          total:times.total.wasm.filter((ms,i)=>ms>2.5*times.total.native[i]).length,
          work:times.work.wasm.filter((ms,i)=>ms>2.5*times.work.native[i]).length
        },
        boundaries:comparisons,
        timingMs:times
      });
    }
    /** @type {Record<Variant,number>} */
    const bytes={native:0,minified:0,wasm:0,reconstructed:0};
    /** @type {Record<Variant,string>} */
    const sha256ByVariant={native:'',minified:'',wasm:'',reconstructed:''};
    for(const variant of variants){
      bytes[variant]=graphs[variant].reduce((n,file)=>n+Buffer.byteLength(file.code),0);
      sha256ByVariant[variant]=graphHash(graphs[variant]);
    }
    return {
      node:process.version,platform:process.platform,
      experiment:'native/minified/Wasm/source-only reconstructed ESM',
      minifier:'esbuild minify:true, ES2022, unbundled modules',
      seed:'i32-four-way-minified-20261121',sourceBytes:bytes,sha256:sha256ByVariant,
      recoveredFunctions,
      completeOutputAndHostCallbackParity:true,
      coldScope:'fresh ESM directories in one Node process; module import/evaluation timed',
      workScope:'application calls and host callbacks timed after import',
      excluded:'build, attacker reconstruction, disk writes, input preparation, process startup, trace hashing',
      rows,
      securityCaveat:'The selected Wasm AST is reconstructable from public bytes. Performance evidence is workload- and runner-specific; even all sampled pairs passing would not establish a universal 2.5x ceiling.'
    };
  }finally{
    (/** @type {any} */(globalThis)).externalBridge=oldBridge;
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module)run().then(async report=>{
  const output=JSON.stringify(report);
  if(process.env.OBFS_WASM_I32_FOUR_WAY_JSON)
    await atomicWrite(process.env.OBFS_WASM_I32_FOUR_WAY_JSON,output+'\n');
  process.stdout.write('WASM_I32_FOUR_WAY_MINIFIED '+output+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={prepare,run};
