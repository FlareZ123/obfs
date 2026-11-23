'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/** @param {string} replacement @returns {ModuleFile[]} */
function sourceGraph(replacement){
  return [
    {path:'state.mjs',sourceType:'module',code:
      'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={auditTag:'reflect-audit'};",
      'export function inspect(){return Reflect.ownKeys(schema).length;}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspect} from './record.mjs';",
      replacement,
      'const count=inspect();',
      'const observed=await globalThis.HOST_OBSERVATION;',
      'console.log(JSON.stringify([state.secretField,count,observed]));'
    ].join('\n')}
  ];
}

/**
 * Independently evaluate the original and transformed ESM graphs with the
 * same opaque host preloader, which can dynamically import source files
 * unknown to the compiler's static ESM graph.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ambient-indirect-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    await atomicWrite(path.join(directory,'preload.cjs'),[
      "'use strict';",
      'const native=Reflect.ownKeys;',
      'globalThis.HOST_OBSERVATION=Promise.resolve(null);',
      'globalThis.HOST_REFLECT=function(receiver){',
      "  if(receiver?.auditTag==='reflect-audit')",
      "    globalThis.HOST_OBSERVATION=import('./state.mjs').then(ns=>Object.keys(ns.state));",
      '  return native(receiver);',
      '};'
    ].join('\n'));
    const processResult=spawnSync(process.execPath,[
      '--require',path.join(directory,'preload.cjs'),
      path.join(directory,'entry.mjs')
    ],{encoding:'utf8',timeout:15000});
    if(processResult.error)throw processResult.error;
    assert.equal(processResult.status,0,processResult.stderr);
    return processResult.stdout.trim();
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

for(const [name,rootExpression] of [
  ['sequence expression','(0,globalThis)'],
  ['conditional expression','(true?globalThis:Object.create(null))'],
  ['array index expression','[globalThis][0]'],
  ['returned local function','getRoot()']
]){
  test('ambient root through '+name+' must preserve opaque host-observed ESM keys',async()=>{
    const getRoot=rootExpression==='getRoot()'?
      'function getRoot(){return globalThis;}':'';
    const original=sourceGraph([
      getRoot,
      'function replace({Reflect:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}',
      'const indirectRoot='+rootExpression+';',
      'replace(indirectRoot);'
    ].join('\n'));
    const native=await execute(original);
    assert.equal(native,'[41,1,["secretField"]]');
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'ambient-root-'+name,
      identifiers:false,strings:false,properties:true
    });
    const emitted=await execute(compiled.files);
    assert.equal(emitted,native,
      'A host callback must observe the original published ESM owner keys');
    assert.equal(compiled.crossFile.properties,0,
      'An unproved ambient-root alias must not justify renaming exported key');
  });
}

test('independent purely owned ESM key still transforms',async()=>{
  /** @type {ModuleFile[]} */
  const original=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'entry.mjs',sourceType:'module',
      code:"import {state} from './state.mjs';console.log(state.secretField);"}
  ];
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'ambient-root-independent-positive',
    identifiers:false,strings:false,properties:true
  });
  assert.ok(compiled.crossFile.properties>=1,
    'The refusal tests must not be mistaken for a zero-yield compiler');
  // The positive case deliberately has no host preloader.
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ambient-positive-'));
  try{
    for(const file of compiled.files)await atomicWrite(path.join(directory,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    if(result.error)throw result.error;
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout.trim(),'41');
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
});
