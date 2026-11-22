'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{name:string,files:SourceFile[],observer:string,kind:'properties'|'bindings'}} Fixture */

/** @type {Fixture[]} */
const fixtures=[
  {
    name:'renamed named export exposes captured member',
    files:[{path:'private.mjs',sourceType:'module',code:
      'const owner={secretField:11};function read(){return owner.secretField;}export {read as publicRead};'}],
    observer:'import {publicRead} from "./private.mjs";console.log(JSON.stringify([publicRead.toString(),publicRead()]));',
    kind:'properties'
  },
  {
    name:'default-exported immutable arrow alias exposes captured member',
    files:[{path:'private.mjs',sourceType:'module',code:
      'const owner={secretField:17};const read=()=>owner.secretField;export default read;'}],
    observer:'import read from "./private.mjs";console.log(JSON.stringify([read.toString(),read()]));',
    kind:'properties'
  },
  {
    name:'exported class method exposes captured member',
    files:[{path:'private.mjs',sourceType:'module',code:
      'const owner={secretField:23};export class Api{read(){return owner.secretField;}}'}],
    observer:'import {Api} from "./private.mjs";const api=new Api();console.log(JSON.stringify([api.read.toString(),api.read()]));',
    kind:'properties'
  },
  {
    name:'reexport exposes source from supplier module',
    files:[
      {path:'private.mjs',sourceType:'module',code:
        'const owner={secretField:31};function read(){return owner.secretField;}export {read};'},
      {path:'bridge.mjs',sourceType:'module',code:
        'export {read as publicRead} from "./private.mjs";'}
    ],
    observer:'import {publicRead} from "./bridge.mjs";console.log(JSON.stringify([publicRead.toString(),publicRead()]));',
    kind:'properties'
  },
  {
    name:'exported array exposes contained function',
    files:[{path:'private.mjs',sourceType:'module',code:
      'const owner={secretField:37};export const api=[function read(){return owner.secretField;}];'}],
    observer:'import {api} from "./private.mjs";console.log(JSON.stringify([api[0].toString(),api[0]() ]));',
    kind:'properties'
  },
  {
    name:'renamed named export exposes parameter spelling',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function read(secretParam){return secretParam+1;}export {read as publicRead};'}],
    observer:'import {publicRead} from "./private.mjs";console.log(JSON.stringify([publicRead.toString(),publicRead(9)]));',
    kind:'bindings'
  }
];

/**
 * Run a closed source group with an independent ESM observer which is not
 * supplied to the compiler. The external observer is the tested threat
 * surface, so including it in the compile-time group would invalidate it.
 * @param {SourceFile[]} files
 * @param {string} observer
 * @returns {Promise<string>}
 */
async function observe(files,observer) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-export-reach-'));
  try {
    for(const file of files) {
      assert.equal(typeof file.code,'string');
      await atomicWrite(path.join(root,file.path),file.code);
    }
    await atomicWrite(path.join(root,'observe.mjs'),observer);
    const child=spawnSync(process.execPath,[path.join(root,'observe.mjs')],{
      cwd:root,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  for(const fixture of fixtures) {
    test('independent ESM source observer parity: '+mode+' / '+fixture.name,async()=>{
      const source=fixture.files;
      const native=await observe(source,fixture.observer);
      const transformed=obfuscateFiles(source,{
        mode,closedWorld:true,seed:'esm-export-reach-'+mode+'-'+fixture.name,
        strings:false,properties:fixture.kind==='properties',
        identifiers:fixture.kind==='bindings'
      });
      const rewriteCount=transformed.files.reduce((count,file)=>count+
        (fixture.kind==='properties'?file.metrics.properties:file.metrics.bindings),0);
      const emitted=await observe(transformed.files,fixture.observer);
      console.log('ESM_EXPORT_REACH '+JSON.stringify({
        mode,case:fixture.name,rewriteKind:fixture.kind,rewriteCount,
        sourceEqual:emitted===native,valueEqual:JSON.parse(emitted)[1]===JSON.parse(native)[1]
      }));
      assert.ok(rewriteCount>0,'Witness needs a genuine source rewrite');
      assert.equal(emitted,native,'External ESM consumer sees changed function source');
    });
  }
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('private nonescaping function retains property rewrite yield: '+mode,async()=>{
    const original=[{path:'private.mjs',sourceType:'module',
      code:'const owner={secretField:43};function read(){return owner.secretField;}export const value=read();'}];
    const observer='import {value} from "./private.mjs";console.log(JSON.stringify([value,value]));';
    const baseline=await observe(original,observer);
    const transformed=obfuscateFiles(original,{
      mode,closedWorld:true,seed:'esm-export-reach-private-'+mode,
      strings:false,identifiers:false
    });
    assert.ok(transformed.files[0].metrics.properties>0,
      'Non-escaping local owner should remain eligible');
    assert.equal(await observe(transformed.files,observer),baseline);
  });
}
