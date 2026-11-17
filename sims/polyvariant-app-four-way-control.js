'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {transform}=require('esbuild');
const {atomicWrite}=require('../src/atomic');
const {pairedBudgetBound}=require('./paired-budget-bound');
const {reconstructPublicMath}=require('./polyvariant-app-static-clone');
const {recoverMinifiedPublicMath}=require('./polyvariant-app-minified-static-attacker');
const {threeQueryTranslationClone}=require('./polyvariant-app-three-query-competitor');
const {compareCandidateEvidence}=require('./candidate-vs-minified-decision');
const {build}=require('../examples/polyvariant-app/build.cjs');

/** @typedef {'native'|'minified'|'published'|'reconstructed'} Variant */
/** @typedef {{path:string,code:string}[]} Graph */
/** @typedef {{kind:string,payload:string}[]} Events */
/** @typedef {{output:string,emitted:number,trace:unknown[],ms:number}} Session */
const names=['math.mjs','state.mjs','entry.mjs'];

/** @param {Graph} graph @returns {string} */
function digest(graph){
  const hash=createHash('sha256');
  for(const file of graph)hash.update(file.path+'\0'+file.code+'\0');
  return hash.digest('hex');
}
/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}
/** @param {number} count @returns {Events} */
function events(count){
  return Array.from({length:count},(_,index)=>({
    kind:['start','tick','pause','stop'][index%4],
    payload:'data-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':'')
  }));
}
/** @param {string} folder @param {Graph} graph @returns {Promise<void>} */
async function materialize(folder,graph){
  for(const file of graph)
    await atomicWrite(path.join(folder,file.path),file.code);
}
/** @param {string} folder @param {Events} records @returns {Promise<Session>} */
async function execute(folder,records){
  const started=performance.now();
  const app=await import(pathToFileURL(path.join(folder,'entry.mjs')).href);
  /** @type {unknown[]} */
  const trace=[];
  const output=app.runScenario(-817,records,{
    /** @param {unknown} value */
    emit(value){trace.push(value);}
  });
  return {output,emitted:trace.length,trace,ms:performance.now()-started};
}
/**
 * Separate the compiler/minifier construction phase from application timing.
 * Only the three exact frozen modules are used, with unbundled ESM imports.
 *
 * @returns {Promise<{graphs:Record<Variant,Graph>,minifiedAttack:{recovered:number,attackMs:number,functions:{name:string,local:string,source:string}[]},publishedAttack:{functions:{name:string,paths:number,offset:number}[],attackMs:number},protectedFunctions:number}>}
 */
async function prepare(){
  /** @type {Graph} */
  const native=await Promise.all(names.map(async name=>({
    path:name,
    code:(await fs.readFile(path.join(__dirname,'../examples/polyvariant-app/native',name),'utf8'))
      .replace(/\r\n/g,'\n')
  })));
  const protectedResult=await build();
  /** @type {Graph} */
  const published=protectedResult.files.map(file=>({
    path:file.path,code:/** @type {string} */(file.code)
  }));
  assert.deepEqual(published.map(file=>file.path),names);
  /** @type {Graph} */
  const minified=await Promise.all(native.map(async file=>({
    path:file.path,
    code:(await transform(file.code,{
      format:'esm',loader:'js',target:'es2022',minify:true,
      legalComments:'none',sourcefile:file.path
    })).code
  })));
  const protectedFunctions=protectedResult.files[0].metrics.polyvariantFunctions;
  assert.equal(protectedFunctions,3,'Experiment must transform the three selected numeric helpers');
  const minifiedAttack=recoverMinifiedPublicMath(minified[0].code);
  const publishedAttack=reconstructPublicMath(published[0].code);
  assert.equal(minifiedAttack.recovered,3);
  assert.equal(publishedAttack.functions.length,3);
  const reconstructed=published.map(file=>({
    path:file.path,
    code:file.path==='math.mjs'?publishedAttack.code:file.code
  }));
  return {graphs:{native,minified,published,reconstructed},
    minifiedAttack,publishedAttack,protectedFunctions};
}
/**
 * Frozen same-input four-way ESM sessions. The static minified attacker
 * receives only emitted minified text, then its recovered code is compared
 * with the trusted original solely as a held-out oracle.
 *
 * @returns {Promise<object>}
 */
async function runEvidence(){
  const {graphs,minifiedAttack,publishedAttack,protectedFunctions}=await prepare();
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-four-way-control-'));
  const variants=/** @type {Variant[]} */(['native','minified','published','reconstructed']);
  const orders=/** @type {Variant[][]} */([
    ['native','minified','published','reconstructed'],
    ['reconstructed','published','minified','native'],
    ['minified','native','reconstructed','published'],
    ['published','reconstructed','native','minified']
  ]);
  /** @type {Array<{timingMs:Record<Variant,number[]>,[key:string]:unknown}>} */
  const rows=[];
  try{
    const originalFolder=path.join(folder,'heldout-original');
    await materialize(originalFolder,graphs.native);
    const originalMath=await import(pathToFileURL(path.join(originalFolder,'math.mjs')).href);
    let functionComparisons=0;
    for(const candidate of minifiedAttack.functions){
      const extracted=/** @type {(value:number)=>number} */(
        Function('return ('+candidate.source+')')());
      assert.equal(typeof extracted,'function');
      for(let index=0;index<4096;index++){
        const input=index<7?[-2147483648,-1,0,1,2147483647,-0,0x12345678|0][index]:
          Math.imul(index^0x5ac31eed,0x9e3779b1)|0;
        assert.ok(Object.is(extracted(input),originalMath[candidate.name](input)),
          'Minified public text fails held-out parity: '+candidate.name+'/'+index);
        functionComparisons++;
      }
    }
    // Matched-query black-box control: identical three f(0) observations
    // against each distribution before any held-out native/output check.
    /** @type {Record<string,{oracleCalls:number,attackMs:number,offsets:Record<string,number>,heldoutComparisons:number,verificationOracleCalls:number}>} */
    const matchedThreeQueryAttacks={};
    for(const variant of variants){
      const probeFolder=path.join(folder,'three-query-'+variant);
      await materialize(probeFolder,graphs[variant]);
      const publicMath=await import(pathToFileURL(
        path.join(probeFolder,'math.mjs')).href);
      const committed=threeQueryTranslationClone(publicMath);
      assert.equal(committed.oracleCalls,3);
      let heldoutComparisons=0;
      for(const name of ['round1','round2','round3']){
        for(let index=0;index<4096;index++){
          const input=index<7?
            [-2147483648,-1,0,1,2147483647,-0,0x12345678|0][index]:
            Math.imul(index^0x5ac31eed,0x9e3779b1)|0;
          const predicted=committed.clone[name](input);
          assert.ok(Object.is(predicted,publicMath[name](input)),
            'Three-query candidate fails held-out public parity: '+variant+'/'+name);
          assert.ok(Object.is(predicted,originalMath[name](input)),
            'Three-query candidate fails held-out native parity: '+variant+'/'+name);
          heldoutComparisons++;
        }
      }
      matchedThreeQueryAttacks[variant]={
        oracleCalls:committed.oracleCalls,attackMs:committed.attackMs,
        offsets:committed.offsets,heldoutComparisons,
        verificationOracleCalls:heldoutComparisons
      };
    }
    for(const count of [1,50,1000,10000]){
      const records=events(count);
      /** @type {Record<Variant,string[]>} */
      const paths={native:[],minified:[],published:[],reconstructed:[]};
      for(let trial=0;trial<12;trial++){
        for(const variant of variants){
          const location=path.join(folder,variant+'-'+count+'-'+trial);
          await materialize(location,graphs[variant]);
          paths[variant].push(location);
        }
      }
      /** @type {Record<Variant,number[]>} */
      const timings={native:[],minified:[],published:[],reconstructed:[]};
      for(let trial=0;trial<12;trial++){
        /** @type {Session|undefined} */
        let expected;
        for(const variant of orders[trial%orders.length]){
          const current=await execute(paths[variant][trial],records);
          assert.equal(current.emitted,count,
            'External callback count differs: '+variant+'/'+count);
          assert.deepEqual(current.trace,JSON.parse(current.output).trace,
            'Emitted host callback values differ from output: '+variant+'/'+count);
          if(expected){
            assert.equal(current.output,expected.output,
              'Full application state differs: '+variant+'/'+count);
            assert.equal(current.emitted,expected.emitted);
            assert.deepEqual(current.trace,expected.trace,
              'External callback trace differs: '+variant+'/'+count);
          }else expected=current;
          timings[variant].push(current.ms);
        }
      }
      rows.push({
        events:count,applicationExecutions:48,
        inputRecords:records.length,
        minifiedVsNative:pairedBudgetBound(timings.native,timings.minified),
        publishedVsNative:pairedBudgetBound(timings.native,timings.published),
        publishedVsMinified:pairedBudgetBound(timings.minified,timings.published),
        reconstructedVsMinified:pairedBudgetBound(timings.minified,timings.reconstructed),
        reconstructedVsNative:pairedBudgetBound(timings.native,timings.reconstructed),
        ratioReconstructedVsPublished:median(timings.reconstructed)/median(timings.published),
        timingMs:timings
      });
    }
    /** @type {Record<Variant,number>} */
    const bytes={native:0,minified:0,published:0,reconstructed:0};
    /** @type {Record<Variant,string>} */
    const hashes={native:'',minified:'',published:'',reconstructed:''};
    for(const variant of variants){
      bytes[variant]=graphs[variant].reduce((sum,file)=>sum+Buffer.byteLength(file.code),0);
      hashes[variant]=digest(graphs[variant]);
    }
    const candidateDecision=compareCandidateEvidence({
      frozenSameApplication:true,nativeOutputAndHostTraceParity:true,
      protectedFunctions,
      conventionalControl:{
        protocol:'int32-translation/three-f0-queries',
        oracleCalls:matchedThreeQueryAttacks.minified.oracleCalls,
        attempted:true,cloneSucceeded:
          matchedThreeQueryAttacks.minified.heldoutComparisons===protectedFunctions*4096,
        verifiedHeldoutComparisons:
          matchedThreeQueryAttacks.minified.heldoutComparisons
      },
      protectedCandidate:{
        protocol:'int32-translation/three-f0-queries',
        oracleCalls:matchedThreeQueryAttacks.published.oracleCalls,
        attempted:true,cloneSucceeded:
          matchedThreeQueryAttacks.published.heldoutComparisons===protectedFunctions*4096,
        verifiedHeldoutComparisons:
          matchedThreeQueryAttacks.published.heldoutComparisons
      },
      sessionPairs:rows.map(row=>({
        native:/** @type {number[]} */ (row.timingMs.native),
        candidate:/** @type {number[]} */ (row.timingMs.published)
      }))
    });
    assert.equal(candidateDecision.attackAdvantage,'contradicted',
      'Known baseline must remain recoverable under the matched probe');
    return {node:process.version,platform:process.platform,
      minifier:'esbuild 0.28.2 transform, unbundled minify:true, ESM ES2022',
      sourceBytes:bytes,sha256:hashes,
      minifiedStaticRecovery:{recovered:minifiedAttack.recovered,
        comparisons:functionComparisons,attackMs:minifiedAttack.attackMs,
        locals:minifiedAttack.functions.map(item=>({name:item.name,local:item.local}))},
      publishedStaticRecovery:{recovered:publishedAttack.functions.length,
        attackMs:publishedAttack.attackMs,paths:publishedAttack.functions},
      matchedThreeQueryAttacks,candidateDecision,protectedFunctions,
      heldoutNativeParity:true,rows};
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
}
if(require.main===module)runEvidence().then(async report=>{
  if(process.env.OBFS_FOUR_WAY_AUDIT_FILE)
    await atomicWrite(process.env.OBFS_FOUR_WAY_AUDIT_FILE,
      JSON.stringify(report,null,2)+'\n');
  process.stdout.write('MINIFIED_FOUR_WAY_CONTROL '+JSON.stringify(report)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={prepare,runEvidence};
