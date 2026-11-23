'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * A fixed external host imports the public reader and retrieves its exact
 * native source. This host is not an input to the obfuscator; its contract is
 * separate from the closed compilation input module set.
 * @param {ModuleFile[]} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function observe(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-remote-public-reader-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    await atomicWrite(path.join(dir,'external-host.mjs'),
      'import {peek,state} from "./state.mjs";'+
      'import {output} from "./entry.mjs";'+
      'process.stdout.write(JSON.stringify({output,source:Function.prototype.toString.call(peek),value:peek(state)}));');
    const child=spawnSync(process.execPath,[path.join(dir,'external-host.mjs')],{
      timeout:5000,encoding:'utf8'
    });
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('external ESM host observes exported cross-file reader exact source',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretValue:29,otherValue:12};'+
        'export const peek=value=>value.secretValue;'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {state,peek} from "./state.mjs";'+
        'export const output=peek(state)+state.otherValue;'}
  ];
  const original=await observe(files);
  assert.equal(original.status,0,original.stderr);
  const transformed=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'external-public-reader-source',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(transformed.crossFile.properties,1,
    'The unrelated own field must remain privately renamable');
  const producer=transformed.files.find(file=>file.path==='state.mjs');
  assert.ok(producer);
  assert.match(String(producer.code),/secretValue/u,
    'Public callable source should keep its original field spelling');
  const output=await observe(/** @type {ModuleFile[]} */(transformed.files));
  assert.deepEqual(output,original,
    'An external named ESM import can observe changed native peek source');
});
