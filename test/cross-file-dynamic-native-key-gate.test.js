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
 * Invoke the native Node ESM loader to distinguish exact exported key shapes.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dynamic-native-key-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * A computed key assembled by a native array method can name "constructor"
 * without any AST literal or pure-string expression spelling that key.
 * @param {string} receiver
 * @returns {ModuleFile[]}
 */
function dynamicReceiver(receiver) {
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'const key=["con","structor"].join("");',
      'const Loader='+receiver+'[key];',
      'const injected=Loader('+JSON.stringify('return import("./state.mjs")')+');',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
}

for(const [name,receiver] of [
  ['anonymous function','(()=>{})'],
  ['Number constructor','Number'],
  ['array filter method','[].filter'],
  ['Object constructor','Object'],
  ['Promise constructor','Promise']
]) {
  test('unknown computed key on '+name+' cannot prove closed-world owner coverage',async()=>{
    const files=dynamicReceiver(receiver);
    const native=await execute(files);
    assert.equal(native,'[41,["secretField"],41]\n');
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'dynamic-constructor-key-'+name,
      strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,0,
      'Runtime-only key accesses a Function constructor and dynamic import: '+name);
    assert.equal(await execute(output.files),native);
  });
}

test('numeric literal array index is inert to dynamic function-key lookup',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41};'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";const values=[1,2];console.log(state.secretField+values[0]);'}
  ];
  const native=await execute(files);
  assert.equal(native,'42\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'numeric-index-closed-world',
    strings:false,identifiers:false
  });
  assert.equal(output.crossFile.properties,1);
  assert.equal(await execute(output.files),native);
});
