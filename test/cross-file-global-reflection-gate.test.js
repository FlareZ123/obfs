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
 * Run the actual ESM module graph in a child process with Node's native
 * dynamic-import behavior, so no mock loader supplies a false proof.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} sources
 * @returns {Promise<string>}
 */
async function execute(sources) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflected-global-'));
  try {
    for(const file of sources)await atomicWrite(path.join(directory,file.path),file.code);
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
 * Generate an exported private candidate and a second module whose runtime
 * loader observes the exact object key without an ESM static import edge.
 * @param {string} prelude
 * @returns {ModuleFile[]}
 */
function witness(prelude){
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:21};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      prelude,
      'const injected=new Loader('+JSON.stringify('return import("./state.mjs")')+');',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
}

for(const [label,prelude] of [
  ['computed destructuring', 'const {["Fun"+"ction"]:Loader}=globalThis;'],
  ['dynamic destructuring key', 'const loaderName="Fun"+"ction";const {[loaderName]:Loader}=globalThis;'],
  ['nested global alias', 'const {globalThis:host}=globalThis;const loaderName="Fun"+"ction";const Loader=host[loaderName];'],
  ['Reflect.get', 'const R=Reflect;const Loader=R.get(globalThis,"Fun"+"ction");'],
  ['Object descriptor', 'const O=Object;const Loader=O.getOwnPropertyDescriptor(globalThis,"Fun"+"ction").value;']
]) {
  test('closed-world ESM owner declines hidden loader via '+label,async()=>{
    const original=witness(prelude);
    const expected=await execute(original);
    assert.equal(expected,'[21,["secretField"],21]\n');
    const output=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'reflected-global-'+label,
      strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,0,output.files[0].code);
    assert.equal(await execute(output.files),expected);
  });
}

for(const [label,prelude] of [
  ['destructured Math', 'const {Math:math}=globalThis;console.log(state.secretField+math.max(4,5));'],
  ['computed immutable Math key', 'const name="Math";const {[name]:math}=globalThis;console.log(state.secretField+math.max(4,5));'],
  ['reflected Math', 'const R=Reflect;const math=R.get(globalThis,"Math");console.log(state.secretField+math.max(4,5));']
]) {
  test('closed-world ESM owner retains proved safe '+label+' access',async()=>{
    /** @type {ModuleFile[]} */
    const files=[
      {path:'state.mjs',sourceType:'module',code:'export const state={secretField:21};'},
      {path:'main.mjs',sourceType:'module',code:'import {state} from "./state.mjs";'+prelude}
    ];
    const native=await execute(files);
    assert.equal(native,'26\n');
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'safe-reflected-'+label,
      strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,1,output.files[0].code);
    assert.equal(await execute(output.files),native);
  });
}
