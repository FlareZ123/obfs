'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const readline=require('node:readline');
const {once}=require('node:events');
const {spawn}=require('node:child_process');
const {createSnoLauncher}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {emitSno}=require('./polyvariant-app-sno');

/** @typedef {{kind:string,payload:string}[]} Records */
/** @typedef {{id:number,seed:number,records:Records,repeat:number,mode?:'application'|'leaves'}} Request */
/** @typedef {{id:number,emitted:number,ms:number,cpuMs:number,digest:string}} Reply */
/** @typedef {{events:number,repetitions:number,nativeMs:number[],snoMs:number[],nativeCpuMs:number[],snoCpuMs:number[],budget:ReturnType<typeof pairedBudgetBound>,cpuBudget:ReturnType<typeof pairedBudgetBound>,strictOverBudgetPairs:number,strictCpuOverBudgetPairs:number,allOutputsEquivalent:boolean}} ResidentRow */
/** @typedef {{child:import('node:child_process').ChildProcessWithoutNullStreams,lines:readline.Interface,iterator:AsyncIterableIterator<string>,stderr:string}} ResidentWorker */

/**
 * @param {number} count
 * @returns {Records}
 */
function records(count){
  return Array.from({length:count},(_,index)=>({
    kind:index%2?'tick':'open',
    payload:'field:'+index+':β'+(index%7===0?'終':'')
  }));
}

/**
 * Override the benchmark entry with a long-lived version of the same real
 * application, and regenerate the protected launcher digest manifest.
 * Nothing in a distributed SNO graph is kept secret from the filesystem owner.
 *
 * @param {string} root
 * @param {boolean} protectedGraph
 * @param {boolean} [compact]
 * @returns {Promise<string>}
 */
async function buildResident(root,protectedGraph,compact=false){
  const built=await emitSno(root,!protectedGraph,compact);
  assert.equal(built.selectedFunctions,3);
  assert.equal(built.changedFiles,protectedGraph?1:0);
  const bridge=await fs.readFile(path.join(__dirname,'sno-resident-entry.cjs'),'utf8');
  await atomicWrite(path.join(root,'entry.cjs'),bridge);
  if(!protectedGraph)return path.join(root,'entry.cjs');
  const names=['math.mjs','state.mjs','entry.mjs','entry.cjs'];
  const files=await Promise.all(names.map(async filename=>({
    path:filename,
    code:await fs.readFile(path.join(root,filename))
  })));
  await atomicWrite(path.join(root,'sno-entry.cjs'),createSnoLauncher(files,'entry.cjs'));
  return path.join(root,'sno-entry.cjs');
}

/**
 * @param {ResidentWorker} worker
 * @returns {Promise<string>}
 */
async function nextLine(worker){
  const timeout=setTimeout(()=>worker.child.kill(),90000);
  try{
    const result=await worker.iterator.next();
    if(result.done)throw new Error('Resident worker exited: '+worker.stderr);
    return result.value;
  }finally{
    clearTimeout(timeout);
  }
}

/**
 * A worker signals readiness only after all imports complete. The SNO launcher
 * has checked every manifest digest before the worker can reach that signal.
 *
 * @param {string} executable
 * @returns {Promise<ResidentWorker>}
 */
async function startResident(executable){
  const child=spawn(process.execPath,[executable],{
    stdio:['pipe','pipe','pipe']
  });
  const lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
  /** @type {ResidentWorker} */
  const worker={child,lines,iterator:lines[Symbol.asyncIterator](),stderr:''};
  child.stderr.on('data',chunk=>{worker.stderr+=String(chunk).slice(0,8192);});
  assert.equal(await nextLine(worker),'READY','Resident initialization failed: '+worker.stderr);
  return worker;
}

/**
 * @param {ResidentWorker} worker
 * @param {Request} request
 * @returns {Promise<Reply>}
 */
async function submit(worker,request){
  const response=nextLine(worker);
  worker.child.stdin.write(JSON.stringify(request)+'\n');
  const result=/** @type {Reply} */ (JSON.parse(await response));
  assert.equal(result.id,request.id);
  assert.equal(result.emitted,request.records.length*request.repeat);
  assert.ok(Number.isFinite(result.ms)&&result.ms>0,'Expected positive wall duration');
  assert.ok(Number.isFinite(result.cpuMs)&&result.cpuMs>0,'Expected positive CPU duration');
  assert.match(result.digest,/^[0-9a-f]{64}$/u);
  return result;
}

/**
 * @param {ResidentWorker} worker
 * @returns {Promise<void>}
 */
async function closeResident(worker){
  worker.child.stdin.end();
  if(worker.child.exitCode===null)await once(worker.child,'close');
  worker.lines.close();
}

/**
 * The original source and published SNO graph execute in separate persistent
 * Node processes, with each process importing the application exactly once.
 * Alternating request order mitigates short scheduling drift. The measured
 * interval starts immediately before runScenario and ends after its final
 * return, excluding process startup, digest verification, ESM import, IPC,
 * JSON input parsing and result hashing for BOTH variants. Both elapsed
 * monotonic wall time and process CPU usage are measured inside each worker;
 * the latter more closely matches the specified *compute* budget. These
 * are scoped SNO *post-init repeated-compute* measurements.
 *
 * @param {number} [rounds]
 * @param {boolean} [compact]
 * @returns {Promise<{source:string,node:string,platform:NodeJS.Platform,compact:boolean,initializationExcluded:boolean,rows:ResidentRow[],leafRows:ResidentRow[]}>}
 */
async function run(rounds=13,compact=false){
  if(!Number.isSafeInteger(rounds)||rounds<5||rounds>100)
    throw new RangeError('Resident SNO profile requires 5 through 100 trials');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-resident-'));
  /** @type {ResidentWorker[]} */
  const workers=[];
  try{
    const nativeEntry=await buildResident(path.join(root,'native'),false);
    const snoEntry=await buildResident(path.join(root,'protected'),true,compact);
    const native=await startResident(nativeEntry);
    workers.push(native);
    const sno=await startResident(snoEntry);
    workers.push(sno);
    /** @type {ResidentRow[]} */
    const rows=[];
    let id=0;
    for(const [count,repeat] of [[1,50000],[50,2500],[1000,80],[10000,5]]){
      // Duration-amplify true application calls: Windows process.cpuUsage()
      // may report zero for millisecond-scale request batches.
      const input=records(count);
      const base={seed:0x4137109d,records:input,repeat};
      // Warm both engines on the same exact workload before collecting pairs.
      for(let i=0;i<3;i++){
        const request={...base,id:++id};
        const original=await submit(native,request);
        const published=await submit(sno,request);
        assert.equal(published.digest,original.digest);
      }
      /** @type {number[]} */
      const nativeMs=[];
      /** @type {number[]} */
      const snoMs=[];
      /** @type {number[]} */
      const nativeCpuMs=[];
      /** @type {number[]} */
      const snoCpuMs=[];
      for(let trial=0;trial<rounds;trial++){
        const request={...base,id:++id};
        /** @type {Reply|undefined} */
        let original,published;
        if(trial%2===0){
          original=await submit(native,request);
          published=await submit(sno,request);
        }else{
          published=await submit(sno,request);
          original=await submit(native,request);
        }
        assert.equal(published.digest,original.digest,'Resident stateful output changed');
        nativeMs.push(original.ms);
        snoMs.push(published.ms);
        nativeCpuMs.push(original.cpuMs);
        snoCpuMs.push(published.cpuMs);
      }
      const budget=pairedBudgetBound(nativeMs,snoMs);
      const cpuBudget=pairedBudgetBound(nativeCpuMs,snoCpuMs);
      rows.push({
        events:count,repetitions:repeat,nativeMs,snoMs,nativeCpuMs,snoCpuMs,
        budget,cpuBudget,
        strictOverBudgetPairs:nativeMs.filter((ms,index)=>snoMs[index]>2.5*ms).length,
        strictCpuOverBudgetPairs:nativeCpuMs.filter((ms,index)=>snoCpuMs[index]>2.5*ms).length,
        allOutputsEquivalent:true
      });
    }
    // Direct selected-function stress detects overhead diluted by the
    // surrounding stateful session and JSON work in the main application.
    /** @type {ResidentRow[]} */
    const leafRows=[];
    // The compact encoding is fast enough that Windows CPU quantization
    // needs longer individual samples than the full affine encoding.
    for(const repeat of compact?[200000000,400000000]:[40000000,80000000]){
      const base=/** @type {Request} */ ({
        id:0,seed:0x4137109d,records:[],mode:'leaves',repeat
      });
      for(let i=0;i<3;i++){
        const request={...base,id:++id};
        const original=await submit(native,request);
        const published=await submit(sno,request);
        assert.equal(published.digest,original.digest);
      }
      /** @type {number[]} */
      const nativeMs=[];
      /** @type {number[]} */
      const snoMs=[];
      /** @type {number[]} */
      const nativeCpuMs=[];
      /** @type {number[]} */
      const snoCpuMs=[];
      for(let trial=0;trial<rounds;trial++){
        const request={...base,id:++id};
        /** @type {Reply} */
        let original,published;
        if(trial%2===0){
          original=await submit(native,request);
          published=await submit(sno,request);
        }else{
          published=await submit(sno,request);
          original=await submit(native,request);
        }
        assert.equal(published.digest,original.digest,'Hot selected arithmetic changed');
        nativeMs.push(original.ms);
        snoMs.push(published.ms);
        nativeCpuMs.push(original.cpuMs);
        snoCpuMs.push(published.cpuMs);
      }
      leafRows.push({
        events:0,repetitions:repeat,nativeMs,snoMs,nativeCpuMs,snoCpuMs,
        budget:pairedBudgetBound(nativeMs,snoMs),
        cpuBudget:pairedBudgetBound(nativeCpuMs,snoCpuMs),
        strictOverBudgetPairs:nativeMs.filter((ms,index)=>snoMs[index]>2.5*ms).length,
        strictCpuOverBudgetPairs:nativeCpuMs.filter((ms,index)=>snoCpuMs[index]>2.5*ms).length,
        allOutputsEquivalent:true
      });
    }
    return {source:'sims/sno-resident-budget.js',node:process.version,
      platform:process.platform,compact,initializationExcluded:true,rows,leafRows};
  }finally{
    await Promise.allSettled(workers.map(closeResident));
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  const rounds=process.argv[2]===undefined?13:Number(process.argv[2]);
  const compact=process.argv.includes('--compact');
  run(rounds,compact).then(result=>{
    process.stdout.write((compact?'SNO_COMPACT_RESIDENT_BUDGET ':'SNO_RESIDENT_BUDGET ')+
      JSON.stringify(result)+'\n');
  }).catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={records,buildResident,run};
