'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Run an out-of-band host probe. The probe is deliberately not included in
 * the obfuscator's closed-world input, so its native Function#toString call
 * models a host/DevTools observer rather than an in-program source observer.
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function runEsm(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-reader-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    await atomicWrite(path.join(root,'host-probe.mjs'),[
      'import {result} from "./entry.mjs";',
      'import {read} from "./state.mjs";',
      'process.stdout.write(JSON.stringify([result,Function.prototype.toString.call(read)]));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'host-probe.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('single-use factory object plus private readers preserves exported wrapper source',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:[
      'function make(){return {secretField:17,otherField:5};}',
      'const owner=make();',
      'function readSecret(ownerSecret){return ownerSecret.secretField;}',
      'function readOther(ownerOther){const value=ownerOther.otherField;return value;}',
      'export function read(){return readSecret(owner)+readOther(owner);}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {read} from "./state.mjs";',
      'export const result=read();'
    ].join('\n')}
  ];
  const native=await runEsm(files);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const transformed=obfuscateFiles(files,{mode,closedWorld:true,
      seed:'factory-private-reader-'+mode,strings:false,identifiers:false});
    const state=transformed.files.find(file=>file.path==='state.mjs');
    assert.ok(state,mode+': state module must be retained');
    assert.equal(state.metrics.objects,1,mode+': one factory-produced object must be proven');
    assert.equal(state.metrics.properties,2,mode+': both private reader keys must be rewritten');
    assert.doesNotMatch(state.code,/secretField|otherField/u,
      mode+': original private keys must not remain in the factory or readers');
    assert.equal(await runEsm(transformed.files),native,
      mode+': native execution and out-of-band built-in wrapper source must remain identical');
  }
});
