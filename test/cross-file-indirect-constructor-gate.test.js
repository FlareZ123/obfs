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

/**
 * Exercise the real Node ESM loader and dynamic Function constructor.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-indirect-constructor-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * A function's .constructor is Function itself, which can dynamically import
 * the state module and observe its key without spelling Function anywhere.
 * @param {string} prelude
 * @returns {ModuleFile[]}
 */
function witness(prelude){
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:31};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      prelude,
      'const injected=Loader('+JSON.stringify('return import("./state.mjs")')+');',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
}

for(const [label,prelude] of [
  ['function literal constructor', 'const Loader=(()=>{}).constructor;'],
  ['array-method constructor', 'const Loader=[].filter.constructor;'],
  ['global constructor chain', 'const Loader=globalThis.constructor.constructor;'],
  ['number constructor', 'const Loader=Number.constructor;'],
  ['constant computed constructor', 'const key="con"+"structor";const Loader=(()=>{})[key];']
]) {
  test('native constructor-derived runtime import must refuse exported key mangling: '+label,async()=>{
    const original=witness(prelude);
    const expected=await execute(original);
    assert.equal(expected,'[31,["secretField"],31]\n');
    const output=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'indirect-constructor-'+label,
      strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,0,
      'Untracked constructor can create runtime import; '+label);
    assert.equal(await execute(output.files),expected);
  });
}

test('an unrelated safe source without constructor reflection keeps ESM property coverage',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:31};'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";const other={value:1};console.log(state.secretField+other.value);'}
  ];
  const native=await execute(files);
  assert.equal(native,'32\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'unrelated-constructor-positive',
    strings:false,identifiers:false
  });
  assert.equal(output.crossFile.properties,1);
  assert.equal(await execute(output.files),native);
});
