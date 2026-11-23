'use strict';

const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const test=require('node:test');
const {createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Receive compiler-owned SCO ESM response bytes over real local HTTP.
 * @param {ModuleFile[]} sources
 * @returns {Promise<ModuleFile[]>}
 */
async function receive(sources) {
  const server=http.createServer(createScoHandler(sources,{closedWorld:true}));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    assert.ok(address && typeof address==='object');
    /** @type {ModuleFile[]} */
    const output=[];
    for(const file of sources) {
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
 * Evaluate the separately materialized real ESM graph with Node.
 * @param {ModuleFile[]} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-instance-source-'));
  try {
    for(const file of files)
      await atomicWrite(path.join(directory,file.path),file.code);
    const run=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    if(run.error)throw run.error;
    assert.equal(run.status,0,run.stderr);
    return run.stdout;
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('SCO preserves source of an exported instance prototype method observed in the served ESM graph',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'owner.mjs',sourceType:'module',code:
      'export const owner={secretField:7};'},
    {path:'state.mjs',sourceType:'module',code:
      "import {owner} from './owner.mjs';"+
      'class Reader {read(){return owner.secretField;}}'+
      'export const instance=new Reader();'},
    {path:'entry.mjs',sourceType:'module',code:
      "import {instance} from './state.mjs';"+
      'const source=Object.getPrototypeOf(instance).read.toString();'+
      'console.log(JSON.stringify({value:instance.read(),source}));'}
  ];
  const native=await execute(files);
  assert.deepEqual(JSON.parse(native),{
    value:7,source:'read(){return owner.secretField;}'
  });
  const served=await receive(files);
  assert.equal(await execute(served),native);
});

test('SCO retains numerical parity for source-observer-free exported instance',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'owner.mjs',sourceType:'module',code:
      'export const owner={secretField:7};'},
    {path:'state.mjs',sourceType:'module',code:
      "import {owner} from './owner.mjs';"+
      'class Reader {read(){return owner.secretField;}}'+
      'export const instance=new Reader();'},
    {path:'entry.mjs',sourceType:'module',code:
      "import {instance} from './state.mjs';"+
      'console.log(JSON.stringify({value:instance.read()}));'}
  ];
  const native=await execute(files);
  const served=await receive(files);
  assert.equal(await execute(served),native);
});

test('SCO preserves declared prototype method toLocaleString source through HTTP',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'owner.mjs',sourceType:'module',code:
      'export const owner={secretField:7};'},
    {path:'state.mjs',sourceType:'module',code:
      "import {owner} from './owner.mjs';"+
      'class Reader {read(){return owner.secretField;}}'+
      'export const instance=new Reader();'},
    {path:'entry.mjs',sourceType:'module',code:
      "import {instance} from './state.mjs';"+
      'const source=Object.getPrototypeOf(instance).read.toLocaleString();'+
      'console.log(JSON.stringify({value:instance.read(),source}));'}
  ];
  const native=await execute(files);
  assert.deepEqual(JSON.parse(native),{
    value:7,source:'read(){return owner.secretField;}'
  });
  const served=await receive(files);
  assert.equal(await execute(served),native);
});
