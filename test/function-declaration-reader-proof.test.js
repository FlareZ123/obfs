'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @param {string} code @returns {unknown} */
function runCommonJs(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return context.module.exports;
}

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function runEsm(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-function-reader-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('local direct function declarations consume owned fields without changing results',()=>{
  const original=[
    'const root={secretAlpha:23,secretBeta:7};',
    'function first(owner){return owner.secretAlpha;}',
    'function second(owner){return owner.secretBeta;}',
    'module.exports=[first(root)+second(root),first(root),second(root)];'
  ].join('\n');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    for(const seed of ['declaration-reader-A','declaration-reader-B']){
      const prepared=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
        mode,seed,strings:false,identifiers:false
      }).files[0];
      assert.equal(prepared.metrics.objects,1,mode+': exactly one locally-owned record');
      assert.equal(prepared.metrics.properties,2,mode+': both local member keys rewritten');
      assert.deepEqual(JSON.stringify(runCommonJs(prepared.code)),
        JSON.stringify(runCommonJs(original)));
      assert.doesNotMatch(String(prepared.code),/secretAlpha|secretBeta/u);
    }
  }
});

test('cross-module native ESM graph preserves direct named declaration reader calls',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'owner.mjs',sourceType:'module',code:[
      'const privateRecord={secretAlpha:23,secretBeta:7};',
      'function readAlpha(owner){return owner.secretAlpha;}',
      'function readBeta(owner){return owner.secretBeta;}',
      'export function calculate(k){return k*readAlpha(privateRecord)+readBeta(privateRecord);}'
    ].join('\n')},
    {path:'api.mjs',sourceType:'module',code:[
      'import {calculate} from "./owner.mjs";',
      'export function execute(k){return calculate(k)+calculate(k+1);}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {execute} from "./api.mjs";',
      'process.stdout.write(JSON.stringify([execute(0),execute(1),execute(13)]));'
    ].join('\n')}
  ];
  const native=await runEsm(files);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const transformed=obfuscateFiles(files,{mode,closedWorld:true,
      seed:'declaration-reader-esm-'+mode,strings:false,identifiers:false});
    const selected=transformed.files.find(f=>f.path==='owner.mjs');
    assert.ok(selected&&selected.metrics.properties===2,
      mode+': two actually rewritten keys in the declared owner');
    assert.equal(await runEsm(transformed.files),native);
  }
});

test('readers must decline when one helper also consumes an unproved external owner',()=>{
  const source=[
    'const root={secretAlpha:23};',
    'function read(owner){return owner.secretAlpha;}',
    'const external={secretAlpha:13};',
    'module.exports=[read(root),read(external)];'
  ].join('\n');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'declaration-reader-unproved-'+mode,strings:false,identifiers:false
    }).files[0];
    assert.equal(result.metrics.objects,0);
    assert.equal(JSON.stringify(runCommonJs(result.code)),JSON.stringify(runCommonJs(source)));
  }
});

test('source-observed and escaped declaration readers preserve their original source',()=>{
  const unsafe=[
    'const root={secretAlpha:23};function read(owner){return owner.secretAlpha;}' +
      'module.exports=[read(root),read.toString()];',
    'const root={secretAlpha:23};function read(owner){return owner.secretAlpha;}' +
      'module.exports={read,value:read(root)};'
  ];
  for(const source of unsafe)for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'declaration-reader-escape-'+mode,strings:false,identifiers:false
    }).files[0];
    assert.equal(result.metrics.objects,0,mode+': escaped function proof must decline');
  }
});
