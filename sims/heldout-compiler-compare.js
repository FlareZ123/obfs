'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {transform}=require('../lib/transform');
const {normalizeDistributedFiles}=require('./attacker-token-normalize');
const {fixture,execute,kinds}=require('./heldout-object-flow-attack');

/** @typedef {{index:number,files:{path:string,code:string}[]}} Executable */
/** @typedef {{trials:number,candidates:number,mainRenamed:number,checkerRenamed:number,checkerMatched:number,neutralizedMatched:number,compileFailures:number,runtimeFailures:number,normalizedLabels:number,firstFailure:string|null}} KindMetrics */

/**
 * Compare two independent obfuscator implementations against the exact same
 * Node ESM graphs, and attempt a source-only label normalization on the
 * independently compiled artifact. Checker errors/mismatches are measured,
 * rather than silently dropping difficult cases from the denominator.
 *
 * @param {number} [seedCount]
 * @returns {Promise<{graphs:number,files:number,candidateFields:number,
 *   mainRenamed:number,checkerRenamed:number,mainMatched:number,
 *   checkerMatched:number,neutralizedMatched:number,checkerCompileFailures:number,
 *   checkerRuntimeFailures:number,normalizedLabels:number,perKind:Record<string,KindMetrics>}>}
 */
async function runCompare(seedCount=3) {
  if(!Number.isSafeInteger(seedCount)||seedCount<1||seedCount>20)
    throw new RangeError('seedCount must be an integer from 1 to 20');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-compiler-comparison-'));
  try {
    const cases=[];
    for(let seed=0;seed<seedCount;seed++)
      for(const kind of kinds)cases.push(fixture(seed,kind));
    const baseline=await execute(path.join(root,'baseline'),cases);
    /** @type {Record<string,KindMetrics>} */
    const perKind={};
    let mainRenamed=0,checkerRenamed=0,mainMatched=0,checkerMatched=0;
    let neutralizedMatched=0,checkerCompileFailures=0,checkerRuntimeFailures=0;
    let normalizedLabels=0;
    for(const item of cases) {
      const metric=perKind[item.kind]??(perKind[item.kind]={
        trials:0,candidates:0,mainRenamed:0,checkerRenamed:0,
        checkerMatched:0,neutralizedMatched:0,compileFailures:0,
        runtimeFailures:0,normalizedLabels:0,firstFailure:null
      });
      metric.trials++;
      metric.candidates+=item.privateFields;
      const main=obfuscateFiles(item.files,{
        mode:'coo',seed:'compiler-pair/'+item.index,
        closedWorld:true,strings:false,identifiers:false
      });
      mainRenamed+=main.crossFile.properties;
      metric.mainRenamed+=main.crossFile.properties;
      assert.equal(main.crossFile.properties,item.expected,
        'Main compiler changed its proven/refused coverage: '+item.kind);
      const mainResult=await execute(path.join(root,'main-'+item.index),[
        {index:item.index,files:/** @type {Executable['files']} */ (main.files)}
      ]);
      if(JSON.stringify(mainResult[0])===JSON.stringify(baseline[item.index]))mainMatched++;

      /** @type {ReturnType<typeof transform>} */
      let compiled;
      try {
        compiled=transform(Object.fromEntries(item.files.map(file=>[file.path,file.code])),{
          seed:'compiler-pair/'+item.index,closedWorld:true
        });
      }catch(error) {
        checkerCompileFailures++;
        metric.compileFailures++;
        metric.firstFailure??=String(error instanceof Error?error.message:error).slice(0,300);
        continue;
      }
      checkerRenamed+=compiled.renamed;
      metric.checkerRenamed+=compiled.renamed;
      const files=Object.entries(compiled.files).map(([p,code])=>({path:p,code}));
      const normalized=normalizeDistributedFiles(files);
      normalizedLabels+=normalized.properties;
      metric.normalizedLabels+=normalized.properties;
      /** @param {string} label @param {Executable['files']} input @returns {Promise<boolean>} */
      async function testOutput(label,input) {
        try {
          const outcome=await execute(path.join(root,label+'-'+item.index),[
            {index:item.index,files:input}
          ]);
          return JSON.stringify(outcome[0])===JSON.stringify(baseline[item.index]);
        }catch(error) {
          checkerRuntimeFailures++;
          metric.runtimeFailures++;
          metric.firstFailure??=String(error instanceof Error?error.message:error).slice(0,300);
          return false;
        }
      }
      if(await testOutput('checker',files)) {
        checkerMatched++;
        metric.checkerMatched++;
      } else metric.firstFailure??='checker execution differed from original result';
      if(await testOutput('neutralized',normalized.files)) {
        neutralizedMatched++;
        metric.neutralizedMatched++;
      } else metric.firstFailure??='normalized execution differed from original result';
    }
    assert.equal(mainMatched,cases.length,'Main compiler must preserve this corpus');
    return {
      graphs:cases.length,
      files:cases.reduce((sum,item)=>sum+item.files.length,0),
      candidateFields:cases.length*2,
      mainRenamed,checkerRenamed,mainMatched,checkerMatched,
      neutralizedMatched,checkerCompileFailures,checkerRuntimeFailures,
      normalizedLabels,perKind
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module) {
  runCompare().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runCompare};
