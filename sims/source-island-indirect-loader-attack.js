'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */

/** @type {SourceFile} */
const watched={
  path:'watched.mjs',sourceType:'module',
  code:'const obj={seen:17};const read=obj.seen;export function watched(){return read;}'
};
/** @type {SourceFile} */
const independent={
  path:'independent.mjs',sourceType:'module',
  code:'const recordB={privateB:23};const valueB=recordB.privateB;export function unrelated(){return valueB;}'
};
/**
 * All reflective/dynamic loader primitives are reached through string fragments,
 * so the ESM importer's syntax contains no literal Function, eval, process,
 * fs importer or direct readFile method. The witness is a capability escape
 * from the limited declared-graph proof, not an outside attacker patch.
 * @type {SourceFile}
 */
const entry={
  path:'entry.mjs',sourceType:'module',
  code: [
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'const create=Reflect.get(()=>0,"con"+"structor");',
    'const load=create("return import(\\"node:fs/promises\\")");',
    'const file=Reflect.get(await load(),"re"+"adFile");',
    'const entryPath=create("return process.argv[1]")();',
    'const target=entryPath.replace(/entry\\.mjs$/,"independent.mjs");',
    'const bytes=await file(target,"utf8");',
    'console.log(JSON.stringify({watched:watched.toString(),fieldVisible:bytes.includes("privateB"),value:unrelated()}));'
  ].join('\n')
};

/**
 * @param {SourceFile[]|import('../src/core').OutputFile[]} files
 * @returns {Promise<{watched:string,fieldVisible:boolean,value:number}>}
 */
async function run(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-island-escape-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr || child.error?.message);
    return /** @type {{watched:string,fieldVisible:boolean,value:number}} */ (JSON.parse(child.stdout));
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @returns {Promise<void>} */
async function main(){
  const sources=[watched,independent,entry];
  const options={
    mode:'coo',closedWorld:true,seed:'source-island-indirect-ctor',
    strings:false,identifiers:false
  };
  const baseline=await run(sources);
  const conservative=obfuscateFiles(sources,options);
  assert.equal(conservative.files.reduce((n,f)=>n+f.metrics.properties,0),0,
    'Group-wide source observer should refuse the normal transformation');

  let island;
  try{
    island=obfuscateFiles(sources,{
      ...options,experimentalSourceObserverIslands:['independent.mjs']
    });
  }catch(error){
    console.log('SOURCE_ISLAND_INDIRECT_LOADER '+JSON.stringify({
      status:'rejected',reason:String(error),native:baseline,
      originalSourceObservation:true
    }));
    return;
  }
  const emitted=await run(island.files);
  const renamed=island.files.find(f=>f.path==='independent.mjs')?.metrics.properties??0;
  const mismatch=baseline.fieldVisible!==emitted.fieldVisible;
  assert.equal(baseline.fieldVisible,true);
  assert.equal(baseline.value,23);
  assert.equal(emitted.value,baseline.value);
  assert.equal(emitted.watched,baseline.watched);
  console.log('SOURCE_ISLAND_INDIRECT_LOADER '+JSON.stringify({
    status:mismatch?'source-byte-observation-changed':'no-source-observation-change',
    renamed,baseline,emitted,
    transformedLeaf:island.files.find(f=>f.path==='independent.mjs')?.code
  }));
  if(renamed>0)assert.equal(mismatch,true,
    'A genuinely renamed field must change the indirect source-file observer');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
