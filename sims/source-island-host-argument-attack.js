'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile[]} */
const files=[
  {path:'watched.mjs',sourceType:'module',
    code:'const a={visibleA:17};const v=a.visibleA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'const originalWatchedSource=watched.toString();',
    'export function inspect(readSource){',
    '  return {watchedSource:originalWatchedSource,value:unrelated(),',
    '    sourceHasPrivateB:readSource("independent.mjs").includes("privateB")};',
    '}'
  ].join('\n')}
];

const runner=[
  'import {readFileSync} from "node:fs";',
  'import {inspect} from "./entry.mjs";',
  'console.log(JSON.stringify(inspect(name=>readFileSync(',
  '  new URL(name,import.meta.url),"utf8"))));'
].join('\n');

/**
 * The runtime's external host provides the file-reading capability.
 * The compiler only receives the three application modules above.
 * @param {SourceFile[]} group
 * @returns {Promise<{watchedSource:string,value:number,sourceHasPrivateB:boolean}>}
 */
async function execute(group){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-island-host-arg-'));
  try{
    for(const file of group)await atomicWrite(path.join(folder,file.path),file.code);
    await atomicWrite(path.join(folder,'host-runner.mjs'),runner);
    const child=spawnSync(process.execPath,[path.join(folder,'host-runner.mjs')],{
      cwd:folder,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout.trim());
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
}

/** @returns {Promise<void>} */
async function main(){
  const expectGuarded=process.argv.includes('--expect-guarded');
  /** @type {'coo'|'sno'|'sco'} */
  const mode='coo';
  const options={mode,closedWorld:true,seed:'source-island-host-callback-20261118',
    strings:false,identifiers:false};
  const native=await execute(files);
  assert.equal(native.value,23);
  assert.equal(native.sourceHasPrivateB,true);
  const normal=obfuscateFiles(files,options);
  assert.equal(normal.files.reduce((sum,file)=>sum+file.metrics.properties,0),0);
  assert.deepEqual(await execute(normal.files),native);

  const protectedOptions={...options,experimentalSourceObserverIslands:['independent.mjs']};
  if(expectGuarded){
    assert.throws(()=>obfuscateFiles(files,protectedOptions),/Source observer island/);
    console.log('SOURCE_ISLAND_HOST_ARGUMENT '+JSON.stringify({
      status:'guarded',normalSourceParity:true,nativeValue:native.value
    }));
    return;
  }
  const candidate=obfuscateFiles(files,protectedOptions);
  const selected=candidate.files.find(file=>file.path==='independent.mjs');
  assert.ok(selected && selected.metrics.properties>0,
    'Counterexample requires a genuine transformed private own field');
  const observed=await execute(candidate.files);
  assert.equal(observed.value,native.value);
  assert.equal(observed.watchedSource,native.watchedSource);
  assert.equal(observed.sourceHasPrivateB,false);
  console.log('SOURCE_ISLAND_HOST_ARGUMENT '+JSON.stringify({
    status:'observable-source-change',mode,
    protectedProperties:selected.metrics.properties,native,observed
  }));
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});

module.exports={main};
