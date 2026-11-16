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
 * Execute actual Node ESM imports and compare the serialized original key.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflect-non-global-'));
  try{
    for(const f of files)await atomicWrite(path.join(dir,f.path),f.code);
    const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/**
 * The runtime key is "constructor" yet its compiler AST spelling is
 * an unknown dynamic expression. Reflect and destructuring can read the
 * Function constructor without a computed MemberExpression at all.
 * @param {string} access
 * @returns {ModuleFile[]}
 */
function graph(access){
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:47};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'const key=["con","structor"].join("");',
      access,
      'const injected=Loader('+JSON.stringify('return import("./state.mjs")')+');',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
}

for(const [label,access] of [
  ['Number destructuring','const {[key]:Loader}=Number;'],
  ['function destructuring','const {[key]:Loader}=(()=>{});'],
  ['Reflect.get native','const Loader=Reflect.get(Number,key);'],
  ['Reflect.get alias','const R=Reflect;const Loader=R.get((()=>{}),key);'],
  ['Object descriptor native','const O=Object;const Loader=O.getOwnPropertyDescriptor(O.getPrototypeOf(Number),key).value;']
]) {
  test('computed non-global reflective loader cannot prove owner safety: '+label,async()=>{
    const input=graph(access);
    const original=await execute(input);
    assert.equal(original,'[47,["secretField"],47]\n');
    const output=obfuscateFiles(input,{
      mode:'coo',closedWorld:true,seed:'non-global-reflect-'+label,
      strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,0,
      'A reflected native Function constructor can import exported state at runtime');
    assert.equal(await execute(output.files),original);
  });
}

for(const [label,expression] of [
  ['known Reflect field','Reflect.get({foo:4},"foo")'],
  ['known descriptor field','Object.getOwnPropertyDescriptor({foo:4},"foo").value']
]) {
  test('benign known '+label+' retains proven exported key renaming',async()=>{
    /** @type {ModuleFile[]} */
    const files=[
      {path:'state.mjs',sourceType:'module',code:'export const state={secretField:47};'},
      {path:'main.mjs',sourceType:'module',code:
        'import {state} from "./state.mjs";console.log(state.secretField+'+expression+');'}
    ];
    const native=await execute(files);
    assert.equal(native,'51\n');
    const result=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'safe-non-global-reflect-'+label,
      strings:false,identifiers:false
    });
    assert.equal(result.crossFile.properties,1);
    assert.equal(await execute(result.files),native);
  });
}
