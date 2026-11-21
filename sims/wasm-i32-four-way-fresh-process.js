'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {atomicWrite}=require('../src/atomic');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {prepare,records,graphHash}=require('./wasm-i32-four-way-minified');

/** @typedef {'native'|'minified'|'wasm'|'reconstructed'} Variant */
/** @typedef {{path:string,code:string}} File */
/** @typedef {File[]} Graph */
/** @typedef {{importMs:number,workMs:number,totalMs:number,outputHash:string,callbackHash:string,callbacks:number}} ChildSession */
/** @typedef {ChildSession & {spawnWallMs:number}} Session */
/** @typedef {{native:number[],minified:number[],wasm:number[],reconstructed:number[]}} Times */

/** @returns {Times} */
function emptyTimes(){
  return {native:[],minified:[],wasm:[],reconstructed:[]};
}

/** @param {string} folder @param {Graph} graph @returns {Promise<void>} */
async function materialize(folder,graph){
  for(const file of graph)await atomicWrite(path.join(folder,file.path),file.code);
}

/**
 * Execute one graph in a fresh Node process, unlike the same-process
 * fresh-ESM-import graph test. CPU timing starts after the child has parsed
 * its input and ends before digest calculation or process exit.
 *
 * Parent wall timing includes process creation, parsing and serialization,
 * and must not be misreported as a compute-only protected/native comparison.
 *
 * @param {string} folder
 * @param {ReturnType<typeof records>} input
 * @returns {Session}
 */
function execute(folder,input){
  const childScript=path.join(__dirname,'wasm-i32-four-way-child.cjs');
  const started=performance.now();
  const child=spawnSync(process.execPath,[childScript,folder],{
    encoding:'utf8',
    input:JSON.stringify(input),
    timeout:15000,
    maxBuffer:2*1024*1024
  });
  const spawnWallMs=performance.now()-started;
  assert.equal(child.status,0,
    'Fresh Node process failed: '+String(child.stderr||child.error));
  const measured=/** @type {ChildSession} */ (JSON.parse(String(child.stdout)));
  assert.equal(measured.callbacks,input.length);
  assert.ok(Number.isFinite(measured.importMs)&&measured.importMs>0);
  assert.ok(Number.isFinite(measured.workMs)&&measured.workMs>0);
  assert.ok(Number.isFinite(measured.totalMs)&&measured.totalMs>0);
  assert.ok(Number.isFinite(spawnWallMs)&&spawnWallMs>0);
  return {...measured,spawnWallMs};
}

/**
 * Native, ordinary minified, public Wasm and public-only reconstructed ESM
 * use four separate processes per paired trial. Process startup, ESM import
 * and execution boundaries are recorded independently. No WebAssembly or
 * observer data is hidden from the reconstructed-public-source attacker.
 * @returns {Promise<object>}
 */
async function run(){
  const {graphs,recoveredFunctions}=await prepare();
  assert.equal(recoveredFunctions,2);
  /** @type {Variant[]} */
  const variants=['native','minified','wasm','reconstructed'];
  /** @type {Variant[][]} */
  const orders=[
    ['native','minified','wasm','reconstructed'],
    ['reconstructed','wasm','minified','native'],
    ['minified','native','reconstructed','wasm'],
    ['wasm','reconstructed','native','minified']
  ];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wasm-four-process-'));
  /** @type {object[]} */
  const rows=[];
  try{
    for(const count of [1,50,1000,10000]){
      const input=records(count);
      /** @type {{import:Times,work:Times,total:Times,spawnWall:Times}} */
      const times={
        import:emptyTimes(),work:emptyTimes(),total:emptyTimes(),
        spawnWall:emptyTimes()
      };
      for(let trial=0;trial<12;trial++){
        /** @type {Record<Variant,string>} */
        const directories={native:'',minified:'',wasm:'',reconstructed:''};
        for(const variant of variants){
          const directory=path.join(root,variant+'-'+count+'-'+trial);
          await materialize(directory,graphs[variant]);
          directories[variant]=directory;
        }
        /** @type {Session|undefined} */
        let reference;
        for(const variant of orders[trial%orders.length]){
          const observed=execute(directories[variant],input);
          if(reference){
            assert.equal(observed.outputHash,reference.outputHash,
              'Output mismatch in fresh process '+variant+'/'+count);
            assert.equal(observed.callbackHash,reference.callbackHash,
              'Callback mismatch in fresh process '+variant+'/'+count);
          }else reference=observed;
          times.import[variant].push(observed.importMs);
          times.work[variant].push(observed.workMs);
          times.total[variant].push(observed.totalMs);
          times.spawnWall[variant].push(observed.spawnWallMs);
        }
      }
      const native=times.work.native,wasm=times.work.wasm;
      rows.push({
        calls:count,trialPairs:12,
        wasmVsNativeWork:pairedBudgetBound(native,wasm),
        wasmVsMinifiedWork:pairedBudgetBound(times.work.minified,wasm),
        wasmVsNativeChildTotal:pairedBudgetBound(times.total.native,times.total.wasm),
        wasmVsNativeParentWall:pairedBudgetBound(times.spawnWall.native,times.spawnWall.wasm),
        strictObservedBreaches:{
          work:wasm.filter((n,index)=>n>2.5*native[index]).length,
          childTotal:times.total.wasm.filter((n,index)=>
            n>2.5*times.total.native[index]).length,
          parentWall:times.spawnWall.wasm.filter((n,index)=>
            n>2.5*times.spawnWall.native[index]).length
        },
        timingMs:times
      });
    }
    /** @type {Record<Variant,string>} */
    const sourceHashes={native:'',minified:'',wasm:'',reconstructed:''};
    for(const variant of variants)sourceHashes[variant]=graphHash(graphs[variant]);
    return {
      platform:process.platform,node:process.version,
      sourceHashes,
      testedVariants:variants,sourceRecoveredFunctions:recoveredFunctions,
      processPairsPerWorkload:12,
      totalFreshProcesses:192,
      fullOutputAndHostCallbackParity:true,
      childBoundaries:'child measures import+eval, app work and their sum',
      parentBoundary:'spawn wall includes process creation, IPC and JSON',
      selectedInputs:'primitive signed Int32 a,b,c,d; strings are host callback labels',
      excludedFromChild:'graph compilation, disk writes, process start and trace digest',
      rows,
      caveat:'Fresh processes avoid cross-variant JIT and ESM cache feedback, but process load/scheduling remain variable. Selected small-call work is microsecond-scale. No sample can prove a universal 2.5x budget or confidential public Wasm.'
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module)run().then(async report=>{
  const json=JSON.stringify(report);
  if(process.env.OBFS_WASM_I32_FOUR_PROCESS_JSON)
    await atomicWrite(process.env.OBFS_WASM_I32_FOUR_PROCESS_JSON,json+'\n');
  process.stdout.write('WASM_I32_FOUR_WAY_FRESH_PROCESS '+json+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={execute,run};
