'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');
const {ablate,withOwnKeyCalls,withNullPrototypeRecord}=require('./application-challenge-observer-ablation');
const {copyAttack}=require('./application-challenge-offline-copy');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */

/** @param {ModuleFile[]} files @param {string} destination @returns {Promise<void>} */
async function materialize(files,destination){
  await fs.mkdir(destination,{recursive:true});
  for(const file of files)await atomicWrite(path.join(destination,file.path),file.code);
}

/** @param {string} folder @param {number[][]} cases @returns {unknown[]} */
function evaluate(folder,cases){
  const job=spawnSync(process.execPath,[path.join(folder,'entry.mjs'),JSON.stringify(cases)],{
    encoding:'utf8',timeout:30000
  });
  if(job.error)throw job.error;
  assert.equal(job.status,0,job.stderr);
  return JSON.parse(job.stdout);
}

/** @param {ModuleFile[]} files @returns {string} */
function digest(files){
  return createHash('sha256').update(files.map(file=>file.code).join('\0')).digest('hex');
}

/** @returns {Promise<{rows:unknown[],sampleCount:number}>} */
async function main(){
  /** @type {ModuleFile[]} */
  const original=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:'module',code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const cases=[
    [0,0],[0,1],[1,1],[4294967295,3],
    ...Array.from({length:80},(_,index)=>[
      Math.imul(index+37,2654435761)>>>0,(index*317)%5000
    ])
  ];
  const heldout=Array.from({length:160},(_,index)=>[
    (Math.imul(index+0x1234,0x9e3779b1)^(index<<7))>>>0,
    (index*317)%5000
  ]);
  const working=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-refusal-yield-'));
  const rows=[];
  try {
    for(const [variant,expected] of /** @type {[string,number][]} */ ([
      ['none',0],['both',0],['own-only',2],['null-proto',2]
    ])){
      const withoutObservers=ablate(original,/** @type {'none'|'both'} */(
        variant==='own-only'||variant==='null-proto'?'both':variant));
      const input=variant==='own-only'?withOwnKeyCalls(withoutObservers):
        variant==='null-proto'?withNullPrototypeRecord(withoutObservers):withoutObservers;
      const output=obfuscateFiles(input,{
        mode:'coo',closedWorld:true,seed:SEED,
        identifiers:true,properties:true,strings:false
      });
      assert.equal(output.crossFile.properties,expected,
        'Expected matched private-field coverage for '+variant);
      const rawFolder=path.join(working,variant,'native');
      const emittedFolder=path.join(working,variant,'compiled');
      await materialize(input,rawFolder);
      await materialize(/** @type {ModuleFile[]} */(output.files),emittedFolder);
      const native=evaluate(rawFolder,cases);
      const delivered=evaluate(emittedFolder,cases);
      assert.deepEqual(delivered,native,'Native application semantics must match for '+variant);
      // This independent public-directory attacker imports neither original
      // source nor compiler. Any authorized offline client can copy COO.
      const expectedHeldout=evaluate(rawFolder,heldout);
      assert.deepEqual(copyAttack(emittedFolder,heldout),expectedHeldout,
        'Offline public-directory copy must preserve held-out behavior for '+variant);
      const inputBytes=input.reduce((total,file)=>total+Buffer.byteLength(file.code),0);
      const outputBytes=output.files.reduce((total,file)=>total+Buffer.byteLength(file.code),0);
      const changedFiles=input.filter((file,index)=>file.code!==output.files[index].code);
      const changedInputBytes=changedFiles.reduce((total,file)=>
        total+Buffer.byteLength(file.code),0);
      rows.push({
        variant,
        sourceObserverPresent:variant==='none',
        removedMissingKeyCall:variant==='own-only',
        recordHasDeclaredNullPrototype:variant==='null-proto',
        originalSha256:digest(input),
        emittedSha256:digest(/** @type {ModuleFile[]} */(output.files)),
        files:input.length,candidatePrivateFields:2,renamedPrivateFields:output.crossFile.properties,
        inputBytes,outputBytes,changedFiles:changedFiles.map(file=>file.path),
        changedInputBytes,changedInputByteFraction:changedInputBytes/inputBytes,
        differentialCases:cases.length,
        heldoutOfflineCloneCases:heldout.length,
        publicOnlyOfflineCloneMatched:true,
        allOutputsMatched:true
      });
    }
  }finally{
    await fs.rm(working,{recursive:true,force:true});
  }
  assert.equal(rows[0].changedInputByteFraction,0);
  assert.equal(rows[1].renamedPrivateFields,0,
    'Lexical file changes cannot be mistaken for private-field coverage');
  assert.equal(rows[2].renamedPrivateFields,2);
  assert.equal(rows[3].renamedPrivateFields,2);
  assert.ok(rows[2].changedInputByteFraction>0);
  assert.ok(rows[3].changedInputByteFraction>0);
  process.stdout.write('APPLICATION_REFUSAL_YIELD '+JSON.stringify(rows)+'\n');
  return {rows,sampleCount:cases.length};
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
