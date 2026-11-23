'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Execute an ESM graph after an out-of-graph preloader mutates Number.prototype.
 *
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function executeWithPreloader(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-number-primitive-host-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'preload.cjs');
    await atomicWrite(preloader,
      "Object.defineProperty(Number.prototype,'callback',{configurable:true,get(){return Function;}});");
    const child=spawnSync(process.execPath,
      ['-r',preloader,path.join(directory,'main.mjs')],
      {encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout;
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('number primitive object destructuring must account for host Number prototype getters',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'const {callback:Loader}=0;',
      'const injected=Loader('+JSON.stringify('return import("./state.mjs")')+');',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
  const native=await executeWithPreloader(files);
  assert.equal(native,'[53,["secretField"],53]\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'number-primitive-object-pattern-control',
    strings:false,identifiers:false,properties:true
  });
  const emitted=await executeWithPreloader(output.files);
  assert.equal(emitted,native,
    'Object destructuring from a Number primitive can invoke host Number.prototype accessors');
  assert.equal(output.crossFile.properties,0,
    'A host getter on Number.prototype can supply a hidden callback from a numeric primitive');
});
