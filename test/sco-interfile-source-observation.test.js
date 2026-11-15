'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Fetch independent ESM files exactly as a browser would receive them.
 * @param {ModuleFile[]} source
 * @returns {Promise<ModuleFile[]>}
 */
async function receive(source) {
  const server=http.createServer(createScoHandler(source,{closedWorld:true}));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    assert.ok(address && typeof address==='object');
    /** @type {ModuleFile[]} */
    const output=[];
    for(const file of source) {
      const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+file.path);
      assert.equal(response.status,200,file.path);
      output.push({...file,code:await response.text()});
    }
    return output;
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/**
 * Compare observable native Function#toString through Node's real ESM linker.
 * @param {ModuleFile[]} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-source-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:10000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('SCO preserves source spelling of exported functions observed by another module',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:
      'function describe(){const local={secretField:7};return local.secretField;}'+
      'function stringify(){const message="sensitive-example-text";return message;}'+
      'export {describe,stringify};'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {describe,stringify} from "./state.mjs";'+
      'console.log(JSON.stringify({source1:describe.toString(),'+
      'source2:stringify.toString(),value:describe()+stringify()}));'}
  ];
  const expected=await execute(files);
  const delivered=await receive(files);
  assert.equal(await execute(delivered),expected,
    'Per-file SCO transformations must honor a source observer in another served file');
});


test('SCO preserves function source read through a constant computed key in another ESM module',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:
      'function inspect(){const local={secretField:42};return local.secretField;}export {inspect};'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {inspect} from "./state.mjs";const key="toString";console.log(inspect[key]());'}
  ];
  const expected=await execute(files);
  const delivered=await receive(files);
  assert.equal(await execute(delivered),expected,
    'An imported function key alias must preserve the exact original source spelling');
});


test('SCO preserves function source retrieved through Reflect.get with a constant key alias',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:
      'function inspect(){const local={secretField:42};return local.secretField;}export {inspect};'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {inspect} from "./state.mjs";const key="toString";'+
      'const stringify=Reflect.get(Object.getPrototypeOf(()=>{}),key);'+
      'console.log(stringify.call(inspect));'}
  ];
  const expected=await execute(files);
  const delivered=await receive(files);
  assert.equal(await execute(delivered),expected,
    'An inherited native source method retrieved through a key alias must preserve source');
});
