'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {string} source @returns {unknown} */
function run(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return context.module.exports;
}

/** @param {string} code @param {number} renamed */
function compare(code,renamed) {
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
      mode,seed:'let-object-alias-proof',strings:false,identifiers:false
    }).files[0];
    assert.equal(JSON.stringify(run(output.code)),JSON.stringify(run(code)),output.code);
    assert.equal(output.metrics.objects,renamed,output.code);
  }
}

for(const [name,source] of [
  ['direct let binding',
    'const root={secretField:7};let alias=root;module.exports=alias.secretField;'],
  ['two-hop let aliases',
    'const root={secretField:7};let first=root;let second=first;module.exports=second.secretField;'],
  ['let alias read and arithmetic write',
    'const root={secretField:7};let alias=root;alias.secretField++;module.exports=root.secretField;'],
  ['let inside proven direct-call function',
    'const root={secretField:7};function consume(value){let alias=value;return alias.secretField;}module.exports=consume(root);']
]) {
  test('read-only let object alias supports property rewriting: '+name,()=>{
    compare(source,1);
  });
}

for(const [name,source] of [
  ['direct rebinding',
    'const root={secretField:7};let alias=root;alias={secretField:9};module.exports=alias.secretField+root.secretField;'],
  ['closure rebinding',
    'const root={secretField:7};let alias=root;function swap(){alias={secretField:9};}swap();module.exports=alias.secretField+root.secretField;'],
  ['destructuring write',
    'const root={secretField:7};let alias=root;({newValue:alias}={newValue:{secretField:9}});module.exports=alias.secretField;'],
  ['opaque argument escape',
    'const root={secretField:7};let alias=root;module.exports=JSON.stringify(alias);'],
  ['duplicate lexical binding spelling',
    'const root={secretField:7};{let alias=root;module.exports=alias.secretField;}{let alias=3;}']
]) {
  test('mutable or escaping let object alias declines: '+name,()=>compare(source,0));
}

/**
 * Execute an ESM file group in a fresh Node process.
 * @param {ReturnType<typeof obfuscateFiles>['files']|{path:string,sourceType:'module',code:string}[]} files
 * @returns {Promise<string>}
 */
async function runEsm(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-let-alias-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
      encoding:'utf8',timeout:10000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('closed-world ESM import permits unmodified let alias flow',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:
      'export const state={secretField:7,another:9};'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";let alias=state;process.stdout.write(JSON.stringify([alias.secretField,alias.another]));'}
  ];
  const expected=await runEsm(files);
  const transformed=obfuscateFiles(files,{
    mode:'coo',seed:'let-alias-esm',closedWorld:true,strings:false,identifiers:false
  });
  assert.equal(transformed.crossFile.objects,1);
  assert.equal(transformed.crossFile.properties,2);
  assert.equal(await runEsm(transformed.files),expected);
});

test('exported let alias exposes ownership and blocks cross-module rewriting',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:
      'export const state={secretField:7};export let alias=state;'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {state,alias} from "./state.mjs";process.stdout.write(JSON.stringify([alias.secretField,state.secretField]));'}
  ];
  const transformed=obfuscateFiles(files,{
    mode:'coo',seed:'let-alias-export-escape',closedWorld:true,strings:false,identifiers:false
  });
  assert.equal(transformed.crossFile.objects,0);
});
