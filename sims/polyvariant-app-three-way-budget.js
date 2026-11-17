'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {reconstructPublicMath}=require('./polyvariant-app-static-clone');
const {build}=require('../examples/polyvariant-app/build.cjs');

/** @typedef {{path:string,code:string}[]} SourceGraph */
/** @typedef {{kind:string,payload:string}[]} Records */
/** @typedef {'native'|'published'|'reconstructed'} Variant */
/** @typedef {{value:string,emissions:number,ms:number}} Session */
/** @typedef {{events:number,comparisons:number,sourceBytes:Record<Variant,number>,nativeMedianMs:number,publishedVsNative:ReturnType<typeof pairedBudgetBound>,reconstructedVsNative:ReturnType<typeof pairedBudgetBound>,ratioReconstructedToPublishedMedians:number,rawSamples:Record<Variant,number[]>}} SessionRow */

/** @param {string} value @returns {string} */
function hash(value){return createHash('sha256').update(value).digest('hex');}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @param {string} folder
 * @param {SourceGraph} files
 * @returns {Promise<void>}
 */
async function materialize(folder,files){
  for(const file of files){
    await atomicWrite(path.join(folder,file.path),file.code);
  }
}

/**
 * Return native, distributed, and independent public-source reconstructed
 * code. Source derivation is not timed in the application process budget,
 * because the actual published COO distribution is built out-of-band.
 * @returns {Promise<{variants:Record<Variant,SourceGraph>,recoveredFunctions:number,attackMs:number,originalSha256:string,publishedSha256:string,reconstructedSha256:string}>}
 */
async function prepare(){
  const names=['math.mjs','state.mjs','entry.mjs'];
  const native=await Promise.all(names.map(async name=>({
    path:name,
    code:(await fs.readFile(path.join(__dirname,'../examples/polyvariant-app/native',name),'utf8'))
      .replace(/\r\n/g,'\n')
  })));
  const published=(await build()).files.map(f=>({
    path:f.path,code:/** @type {string} */(f.code)
  }));
  assert.deepEqual(published.map(file=>file.path),names);
  const recovered=reconstructPublicMath(published[0].code);
  assert.equal(recovered.functions.length,3);
  assert.equal(recovered.publishedBytes,5883);
  const reconstructed=published.map(file=>({
    ...file,code:file.path==='math.mjs'?recovered.code:file.code
  }));
  assert.notEqual(hash(published[0].code),hash(recovered.code));
  for(const name of names.slice(1)){
    assert.equal(native.find(f=>f.path===name)?.code,
      published.find(f=>f.path===name)?.code);
  }
  /** @param {SourceGraph} files @returns {string} */
  const graphDigest=files=>hash(files.map(f=>f.path+'\0'+f.code+'\0').join(''));
  return {
    variants:{native,published,reconstructed},
    recoveredFunctions:recovered.functions.length,
    attackMs:recovered.attackMs,
    originalSha256:graphDigest(native),
    publishedSha256:graphDigest(published),
    reconstructedSha256:graphDigest(reconstructed)
  };
}

/**
 * @param {number} count
 * @returns {Records}
 */
function records(count){
  return Array.from({length:count},(_,index)=>({
    kind:['start','tick','pause','stop'][index%4],
    payload:'data-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':'')
  }));
}

/**
 * The same full graph is imported anew for every session, including the
 * attacker-rebuilt variant. File writes are complete before measurement.
 * @param {string} root
 * @param {Records} events
 * @returns {Promise<Session>}
 */
async function runSession(root,events){
  const started=performance.now();
  const app=await import(pathToFileURL(path.join(root,'entry.mjs')).href);
  let emissions=0;
  const value=app.runScenario(-817,events,{emit(){emissions++;}});
  return {value,emissions,ms:performance.now()-started};
}

/**
 * Paired full-program budget comparison among original, emitted obfuscation,
 * and an actual attacker reconstruction. The attack source is generated
 * independently from the distribution; the recovered code is executed in its
 * own ESM graph. All variants process identical stateful inputs.
 *
 * Timing is descriptive: every process shares one Node V8 runtime in this
 * measurement, while each fresh unique module graph is parsed/evaluated anew.
 * For cold process startup use an additional fresh-process experiment.
 *
 * @returns {Promise<{node:string,platform:NodeJS.Platform,sourceHashes:{native:string,published:string,reconstructed:string},functionRecovery:number,staticAttackMs:number,rounds:number,programs:number,rows:SessionRow[]}>}
 */
async function runEvidence(){
  const prepared=await prepare();
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-public-source-threeway-'));
  const rounds=9;
  const orders=/** @type {Variant[][]} */([
    ['native','published','reconstructed'],
    ['reconstructed','published','native'],
    ['published','native','reconstructed'],
    ['native','reconstructed','published'],
    ['published','reconstructed','native'],
    ['reconstructed','native','published']
  ]);
  /** @type {SessionRow[]} */
  const rows=[];
  try{
    for(const count of [1,50,1000,10000]){
      const inputs=records(count);
      const paths=/** @type {Record<Variant,string[]>} */ ({
        native:[],published:[],reconstructed:[]
      });
      // Prepare all package bytes out of band to keep the timed comparison
      // focused on graph import, code evaluation and actual business work.
      for(let trial=0;trial<rounds;trial++){
        for(const variant of /** @type {Variant[]} */ (['native','published','reconstructed'])){
          const folder=path.join(root,variant+'-'+count+'-'+trial);
          await materialize(folder,prepared.variants[variant]);
          paths[variant].push(folder);
        }
      }
      /** @type {Record<Variant,number[]>} */
      const times={native:[],published:[],reconstructed:[]};
      let comparisons=0;
      for(let trial=0;trial<rounds;trial++){
        /** @type {Session|undefined} */
        let first;
        for(const variant of orders[trial%orders.length]){
          const observed=await runSession(paths[variant][trial],inputs);
          assert.equal(observed.emissions,count,
            'External host API emitted different number of state events: '+variant);
          if(first)assert.equal(observed.value,first.value,
            'Stateful public-source reconstruction changed full application JSON: '+variant);
          else first=observed;
          times[variant].push(observed.ms);
          comparisons++;
        }
      }
      /** @type {Record<Variant,number>} */
      const sourceBytes={native:0,published:0,reconstructed:0};
      for(const variant of /** @type {Variant[]} */ (['native','published','reconstructed'])){
        sourceBytes[variant]=prepared.variants[variant].reduce(
          (sum,file)=>sum+Buffer.byteLength(file.code,'utf8'),0);
      }
      rows.push({
        events:count,comparisons,sourceBytes,
        nativeMedianMs:median(times.native),
        publishedVsNative:pairedBudgetBound(times.native,times.published),
        reconstructedVsNative:pairedBudgetBound(times.native,times.reconstructed),
        ratioReconstructedToPublishedMedians:median(times.reconstructed)/median(times.published),
        rawSamples:times
      });
    }
    return {
      node:process.version,platform:process.platform,
      sourceHashes:{
        native:prepared.originalSha256,
        published:prepared.publishedSha256,
        reconstructed:prepared.reconstructedSha256
      },
      functionRecovery:prepared.recoveredFunctions,
      staticAttackMs:prepared.attackMs,
      rounds,programs:3,rows
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @returns {Promise<void>} */
async function main(){
  const evidence=await runEvidence();
  process.stdout.write('POLYVARIANT_APP_THREE_WAY_BUDGET '+JSON.stringify(evidence)+'\n');
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={prepare,runEvidence};
