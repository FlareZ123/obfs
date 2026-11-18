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
 * Observe actual HTTP-delivered public ESM from the trusted SCO handler.
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
      const reply=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+file.path);
      assert.equal(reply.status,200,file.path);
      output.push({...file,code:await reply.text()});
    }
    return output;
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve()));
  }
}

/**
 * Load the public graph through real Node ESM, independent for each variant.
 * @param {ModuleFile[]} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sco-blob-observer-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:10000
    });
    if(result.error)throw result.error;
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @param {string} expression @param {boolean} [primitive] @returns {ModuleFile[]} */
function modules(expression,primitive=false) {
  return [
    {path:'state.mjs',sourceType:'module',code:primitive?
      'const data={secretField:17};const result=data.secretField;'+
      'export function inspect(){return result;}' :
      'export function inspect(){const data={secretField:17};return data.secretField;}'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {inspect} from "./state.mjs";'+
      'console.log(JSON.stringify({text:'+expression+',value:inspect()}));'}
  ];
}

for(const [name,expression] of [
  ['direct', 'new Blob([],{type:inspect}).type'],
  ['bound', 'new (Blob.bind(null))([],{type:inspect}).type'],
  ['options prebound', 'new (Blob.bind(null,[],{type:inspect}))().type'],
  ['reflective', 'Reflect.construct(Blob,[[],{type:inspect}]).type']
]) {
  test('SCO HTTP preserves native cross-file Blob '+name+' function source',async()=>{
    const before=modules(expression);
    const native=await execute(before);
    assert.match(native,/secretfield/iu,name+' native source');
    const delivered=await receive(before);
    assert.equal(await execute(delivered),native);
    assert.equal(delivered[0].code,before[0].code,
      name+' source-observed producer must remain unchanged');
  });
}

test('SCO HTTP primitive Blob options retain a genuine private field rewrite',async()=>{
  const before=modules('new Blob([],{type:"text/plain"}).type',true);
  const delivered=await receive(before);
  assert.equal(await execute(delivered),await execute(before));
  assert.doesNotMatch(delivered[0].code,/secretField/u,
    'Safe source-free Blob options should not veto private-field renaming');
});
