'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Negative control for a caller that supplies both lexical paths for one
 * runtime ESM module, then preserves the symlink when emitting the graph.
 */
test('negative control: direct API treats lexical symlink aliases as distinct modules',async t=>{
  /** @type {Array<{path:string,sourceType:'module',code:string}>} */
  const files=[
    {path:'lib/state.mjs',sourceType:'module',code:
      'export const state={secretField:23};'},
    {path:'app/alias.mjs',sourceType:'module',code:
      'export const state={secretField:23};'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./lib/state.mjs";'+
      'import {state as alias} from "./app/alias.mjs";'+
      'console.log(state.secretField,alias.secretField);'}
  ];
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-api-symlink-'));
  const aliasAbs=path.join(dir,'app/alias.mjs');
  const targetAbs=path.join(dir,'lib/state.mjs');
  /**
   * @param {Array<{path:string,code:string}>} sources
   * @returns {string}
   */
  async function run(sources) {
    await fs.rm(aliasAbs,{force:true});
    for(const file of sources) {
      if(file.path==='app/alias.mjs')continue;
      await atomicWrite(path.join(dir,file.path),file.code);
    }
    await fs.symlink(path.relative(path.dirname(aliasAbs),targetAbs),aliasAbs,'file');
    const child=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout.trim();
  }
  try {
    let baseline;
    try {
      baseline=await run(files);
    } catch(error) {
      if(['EPERM','EACCES','ENOTSUP','ENOSYS'].includes(
        /** @type {NodeJS.ErrnoException} */(error).code??'')) {
        t.skip('runner does not permit file symlinks');
        return;
      }
      throw error;
    }
    const output=obfuscateFiles(files,{
      mode:'coo',seed:'direct-api-symlink-identity',closedWorld:true,
      strings:false,identifiers:false
    });
    const emitted=await run(output.files);
    assert.equal(baseline,'23 23');
    assert.equal(output.crossFile.properties,2);
    // This is an intentional negative-control assertion: the caller's
    // symlink makes Node load one module while the API proved two path keys.
    assert.equal(emitted,'23 undefined');
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
