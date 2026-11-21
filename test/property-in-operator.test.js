'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {parse}=require('../src/ast');
const {symbolizeLocalProperties}=require('../src/symbol-properties');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {string} source
 * @returns {string}
 */
function evaluate(source){
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {string} source
 * @param {number} renamed
 * @param {'coo'|'sno'} mode
 * @returns {string}
 */
function compare(source,renamed,mode){
  const output=obfuscateFiles([
    {path:'owned.cjs',sourceType:'commonjs',code:source}
  ],{mode,seed:'owned-in-operator-'+mode,strings:false,identifiers:false});
  const emitted=/** @type {string} */ (output.files[0].code);
  assert.equal(evaluate(emitted),evaluate(source),emitted);
  assert.equal(output.files[0].metrics.properties,renamed,emitted);
  return emitted;
}

for(const [name,source] of [
  ['own membership alone', 'const bag={secretField:3};module.exports=("secretField" in bag);'],
  ['own membership alongside own read',
    'const bag={secretField:3};module.exports=[("secretField" in bag),bag.secretField];'],
  ['const alias membership',
    'const bag={secretField:3};const alias=bag;module.exports=("secretField" in alias);'],
  ['own membership after primitive write',
    'const bag={secretField:3};bag.secretField=9;module.exports=("secretField" in bag);'],
  ['nested function owner membership',
    'const bag={secretField:3};function check(){return "secretField" in bag;}module.exports=check();'],
  ['multiple owning objects',
    'const a={secretField:3},b={secretField:7};module.exports=["secretField" in a,"secretField" in b];'],
  ['interprocedural call with only proven owner',
    'function check(input){return "secretField" in input;}const bag={secretField:3};module.exports=check(bag);'],
  ['membership before lexical initialization retains TDZ exception',
    'let output;try{output="secretField" in bag;}catch(error){output=error.name;}'+
    'const bag={secretField:3};module.exports=output;']
]) {
  test('proven own membership rewrites local fields in '+name,()=>{
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])){
      const output=compare(source,name==='multiple owning objects'?2:1,mode);
      assert.doesNotMatch(output,/"secretField" in (bag|alias|a|b)/u,output);
    }
  });
}

for(const [name,source] of [
  ['unknown inherited membership',
    'const bag={secretField:3};module.exports="toString" in bag;'],
  ['dynamic unknown key',
    'const bag={secretField:3};const key=globalThis.unknown;module.exports=key in bag;'],
  ['computed operator left with side effects',
    'const bag={secretField:3};let calls=0;function key(){calls++;return "secretField";}module.exports=[key() in bag,calls];'],
  ['owner escape to native reflection',
    'const bag={secretField:3};module.exports=["secretField" in bag,Object.keys(bag)];'],
  ['deleting an owner key exposes inherited membership',
    'const bag={secretField:3};delete bag.secretField;module.exports="secretField" in bag;'],
  ['mutation through function-valued assignment',
    'const bag={secretField:3};bag.secretField=function(){return Object.keys(this)[0]};module.exports="secretField" in bag;'],
  ['owner value used as left operand of in',
    'const bag={secretField:3};try{module.exports=bag in {}}catch(e){module.exports=e.name;}'],
  ['same function called on different owner shape',
    'function check(input){return "secretField" in input;}'+
    'const bag={secretField:3};module.exports=[check(bag),check({secretField:4})];'],
  ['own and inherited membership both observed',
    'const bag={secretField:3};module.exports=["secretField" in bag,"toString" in bag];'],
  ['native function-source observation',
    'const bag={secretField:3};function probe(){return "secretField" in bag;}'+
    'module.exports=[probe(),String(probe)];']
]) {
  test('unproved or unsafe membership refuses local rewrite: '+name,()=>{
    for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])){
      compare(source,0,mode);
    }
  });
}

test('own membership with Symbol backend rewrites the queried key consistently',()=>{
  const source='const bag={secretField:7};module.exports=["secretField" in bag,bag.secretField];';
  const output=symbolizeLocalProperties(source,parse(source,'commonjs'),{
    seed:'symbol-in-operator'
  });
  assert.equal(output.objects,1,output.code);
  assert.equal(output.properties,1,output.code);
  assert.equal(evaluate(output.code),evaluate(source),output.code);
  assert.doesNotMatch(output.code,/"secretField" in bag/u,output.code);
});

/**
 * Compare native and emitted exact two-module ESM files in a clean Node process.
 * @param {string} exporter
 * @param {string} importer
 * @param {number} renamed
 * @returns {Promise<void>}
 */
async function compareEsm(exporter,importer,renamed){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-in-operator-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'owner.mjs',sourceType:'module',code:exporter},
    {path:'main.mjs',sourceType:'module',code:importer}
  ];
  /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources @returns {Promise<string>} */
  async function run(sources){
    for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }
  try {
    const expected=await run(files);
    const transformed=obfuscateFiles(files,{
      mode:'coo',seed:'cross-owned-in',closedWorld:true,
      strings:false,identifiers:false
    });
    assert.equal(transformed.crossFile.properties,renamed,
      JSON.stringify(transformed.files));
    assert.equal(await run(transformed.files),expected);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('closed-world ESM owner membership is renamed in imported consumer',async()=>{
  await compareEsm(
    'export const bag={secretField:4};',
    'import {bag} from "./owner.mjs";console.log("secretField" in bag);',
    1
  );
});

test('closed-world ESM membership alongside exported owner read preserves outputs',async()=>{
  await compareEsm(
    'export const bag={secretField:4};export function peek(x){return x.secretField;}',
    'import {bag,peek} from "./owner.mjs";'+
      'console.log(["secretField" in bag,peek(bag)]);',
    1
  );
});

test('closed-world ESM nonown inherited name refuses property rewrite',async()=>{
  await compareEsm(
    'export const bag={secretField:4};',
    'import {bag} from "./owner.mjs";console.log("toString" in bag);',
    0
  );
});
