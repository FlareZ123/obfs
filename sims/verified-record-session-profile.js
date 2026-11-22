'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');
const {ablate,withOwnKeyCalls,withNullPrototypeRecord,withCapturedStringArgv}=
  require('./application-challenge-observer-ablation');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */

/**
 * Construct a distinct, source-preserving application contract. The public
 * reader wrappers no longer spell private object keys in their observable
 * Function#toString bodies; internal direct-call-only helpers still do.
 * This is an explicit input-program change, measured against its own native
 * implementation rather than the frozen six-module reference.
 * @param {ModuleFile[]} files
 * @returns {ModuleFile[]}
 */
function withPrivateReaderHelpers(files) {
  return files.map(file=>{
    if(file.path!=='private.mjs')return file;
    const beforeOffset='export function readOffset(owner){return owner.secretOffset;}';
    const beforeSalt='export const readSalt=owner=>owner["secretSalt"];';
    assert.ok(file.code.includes(beforeOffset)&&file.code.includes(beforeSalt),
      'Expected frozen private reader shape');
    return {...file,code:file.code.replace(beforeOffset,
      'function secretOffsetOf(owner){return owner.secretOffset;}\n'+
      '/** @param {EngineKeys} owner */\n'+
      'export function readOffset(owner){return secretOffsetOf(owner);}')
      .replace(beforeSalt,
      'const secretSaltOf=owner=>owner["secretSalt"];\n'+
      '/** @param {EngineKeys} owner */\n'+
      'export const readSalt=owner=>secretSaltOf(owner);')};
  });
}


/**
 * @param {ModuleFile[]} files
 * @param {string} folder
 * @returns {Promise<void>}
 */
async function materialize(files,folder) {
  for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
}

/**
 * Measure a complete original or delivered ESM process, including module load.
 * @param {string} folder
 * @param {number[][]} cases
 * @returns {{ms:number,output:string}}
 */
function run(folder,cases) {
  const begin=performance.now();
  const child=spawnSync(process.execPath,[
    path.join(folder,'entry.mjs'),JSON.stringify(cases)
  ],{encoding:'utf8',timeout:30000});
  const elapsed=performance.now()-begin;
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return {ms:elapsed,output:child.stdout};
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * @typedef {{
 *   variant:string,workload:string,cases:number,nativeMs:number,
 *   emittedMs:number,ratio:number,within2point5:boolean,samples:number,
 *   sourceObserverFree:boolean,ownKeysOnly:boolean,
 *   recordHasDeclaredNullPrototype:boolean,privateFieldsRenamed:number,
 *   allOutputsEqual:boolean
 * }} ProfileRow
 */

/** @returns {Promise<{rows:ProfileRow[]}>} */
async function main() {
  /** @type {ModuleFile[]} */
  const original=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:'module',code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const workloads=[
    {name:'one-event',cases:[[1,1]]},
    {name:'sustained-80',cases:Array.from({length:80},(_,index)=>[
      Math.imul(index+37,2654435761)>>>0,(index*317)%5000
    ])}
  ];
  /** @type {ProfileRow[]} */
  const rows=[];
  // These are separate modified application contracts. The unchanged
  // original source remains a 0/2 owner-field negative control.
  for(const variant of ['own-only','null-proto']){
    const withoutObservers=ablate(original,'both');
    const unguarded=variant==='own-only'?withOwnKeyCalls(withoutObservers):
      withNullPrototypeRecord(withoutObservers);
    const input=withPrivateReaderHelpers(withCapturedStringArgv(unguarded));
    const transformed=obfuscateFiles(input,{
      mode:'coo',closedWorld:true,seed:SEED,
      identifiers:true,properties:true,strings:false
    });
    assert.equal(transformed.crossFile.properties,2,
      'Distinct '+variant+' application must retain genuine private-field coverage');
    const nativeDir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-record-native-'));
    const deliveredDir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-record-emitted-'));
    try {
      await materialize(input,nativeDir);
      await materialize(/** @type {ModuleFile[]} */(transformed.files),deliveredDir);
      for(const workload of workloads){
        const expected=run(nativeDir,workload.cases).output;
        const baseline=[];
        const emitted=[];
        for(let attempt=0;attempt<9;attempt++){
          // Alternate process order to avoid systematic warm-host bias.
          const order=attempt%2===0 ?
            [['native',nativeDir],['emitted',deliveredDir]] :
            [['emitted',deliveredDir],['native',nativeDir]];
          for(const [kind,folder] of order){
            const value=run(folder,workload.cases);
            assert.equal(value.output,expected,kind+' must preserve exact output');
            if(kind==='native')baseline.push(value.ms);
            else emitted.push(value.ms);
          }
        }
        const nativeMs=median(baseline);
        const emittedMs=median(emitted);
        const ratio=emittedMs/nativeMs;
        assert.ok(Number.isFinite(ratio)&&ratio>0);
        rows.push({variant,workload:workload.name,cases:workload.cases.length,
          nativeMs,emittedMs,ratio,within2point5:ratio<=2.5,
          samples:9,sourceObserverFree:true,ownKeysOnly:variant==='own-only',
          recordHasDeclaredNullPrototype:variant==='null-proto',
          privateFieldsRenamed:2,allOutputsEqual:true});
      }
    }finally{
      await Promise.all([nativeDir,deliveredDir].map(dir=>
        fs.rm(dir,{recursive:true,force:true})));
    }
  }
  process.stdout.write('VERIFIED_RECORD_SESSION_PROFILE '+JSON.stringify({
    node:process.version,platform:process.platform,rows,
    scope:'Paired full ESM processes on two distinct modified six-module application contracts'
  })+'\n');
  assert.ok(rows.every(row=>row.within2point5),
    'At least one measured application variant exceeded 2.5x full-session budget');
  return {rows};
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
