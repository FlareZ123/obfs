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
 * Run actual ESM modules in a new Node process. Dynamic import invoked by
 * Function has its own loader behavior and is not modeled by vm.runInNewContext.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-computed-loader-'));
  try {
    for(const file of files) await atomicWrite(path.join(directory,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * A Function constructor hidden by a pure computed property expression can
 * dynamically import the exact already-loaded ESM owner again, then inspect
 * its keys without a statically visible import/identifier reference.
 * @param {string} constructorExpression
 * @returns {ModuleFile[]}
 */
function dynamicSource(constructorExpression) {
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:17};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'const imported=await ('+constructorExpression+'('+
        JSON.stringify('return import("./state.mjs")')+'))();',
      'console.log(JSON.stringify([state.secretField,Object.keys(imported.state),imported.state.secretField]));'
    ].join('\n')}
  ];
}

for(const [label,constructorExpression] of [
  ['concatenated Function', 'new globalThis["Fun" + "ction"]'],
  ['template Function', 'new globalThis['+String.fromCharCode(96)+'Function'+String.fromCharCode(96)+']']
]) {
  test('constant-computed '+label+' declines unsafe cross-file owner renaming',async()=>{
    const files=dynamicSource(constructorExpression);
    const native=await execute(files);
    assert.equal(native,'[17,["secretField"],17]\n');
    const transformed=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'computed-loader-'+label,
      strings:false,identifiers:false
    });
    assert.equal(transformed.crossFile.properties,0,
      'Untracked runtime import can inspect the exact exported property shape');
    assert.equal(await execute(transformed.files),native);
  });
}

test('unrelated static computed global member keeps useful cross-file proof',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:18};'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";console.log(state.secretField+globalThis["Math"].max(2,3));'}
  ];
  const native=await execute(files);
  assert.equal(native,'21\n');
  const transformed=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'benign-computed-global',
    strings:false,identifiers:false
  });
  assert.equal(transformed.crossFile.properties,1);
  assert.equal(await execute(transformed.files),native);
});
