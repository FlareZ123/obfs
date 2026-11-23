'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {Array<{path:string,code:string}>} files @returns {Promise<string>} */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-source-observer-cross-file-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @param {boolean} observe @returns {{path:string,sourceType:'module',code:string}[]} */
function propertyGraph(observe) {
  return [
    {path:'util.mjs',sourceType:'module',code:[
      'const privateState={secretField:3};',
      'export function inspect(){return privateState.secretField;}'
    ].join('\n')},
    {path:'state.mjs',sourceType:'module',code:
      'export const state={unrelatedPrivate:7};'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {inspect} from "./util.mjs";',
      'import {state} from "./state.mjs";',
      ...(observe?['console.log(inspect.toString());']:[]),
      'console.log(state.unrelatedPrivate);'
    ].join('\n')}
  ];
}

/** @param {boolean} observe @returns {{path:string,sourceType:'module',code:string}[]} */
function identifierGraph(observe) {
  return [
    {path:'util.mjs',sourceType:'module',code:
      'export function inspect(){return 3;}'},
    {path:'data.mjs',sourceType:'module',code:[
      'function privateReader(){const unrelatedLocal=11;return unrelatedLocal;}',
      'export const unrelatedValue=privateReader();'
    ].join('\\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {inspect} from "./util.mjs";',
      'import {unrelatedValue} from "./data.mjs";',
      ...(observe?['console.log(inspect.toString());']:[]),
      'console.log(unrelatedValue);'
    ].join('\n')}
  ];
}

test('source observer in entry preserves unrelated cross-file private property yield',async()=>{
  const baselineFiles=propertyGraph(false);
  const observedFiles=propertyGraph(true);
  const baselineExpected=await execute(baselineFiles);
  const observedExpected=await execute(observedFiles);
  const options={
    mode:'coo',closedWorld:true,seed:'source-observer-cross-file-property',
    properties:true,identifiers:false,strings:false
  };
  const baseline=obfuscateFiles(baselineFiles,options);
  const observed=obfuscateFiles(observedFiles,options);
  const baselineState=baseline.files.find(file=>file.path==='state.mjs');
  const observedState=observed.files.find(file=>file.path==='state.mjs');
  assert.ok(baselineState);
  assert.ok(observedState);
  assert.ok(!baselineState.code.includes('unrelatedPrivate'),String(baselineState.code));
  assert.ok(baselineState.metrics.properties>=1,String(baselineState.code));
  // Expected-red witness: observing util.inspect in entry suppresses an
  // unrelated state.mjs property that is not in inspect's source.
  assert.ok(observedState.code.includes('unrelatedPrivate'),String(observedState.code));
  assert.equal(observedState.metrics.properties,0,String(observedState.code));
  assert.equal(await execute(baseline.files),baselineExpected);
  assert.equal(await execute(observed.files),observedExpected);
});

test('source observer in entry preserves unrelated cross-file private local binding yield',async()=>{
  const baselineFiles=identifierGraph(false);
  const observedFiles=identifierGraph(true);
  const baselineExpected=await execute(baselineFiles);
  const observedExpected=await execute(observedFiles);
  const options={
    mode:'coo',closedWorld:true,seed:'source-observer-cross-file-identifier',
    properties:false,identifiers:true,strings:false
  };
  const baseline=obfuscateFiles(baselineFiles,options);
  const observed=obfuscateFiles(observedFiles,options);
  const baselineData=baseline.files.find(file=>file.path==='data.mjs');
  const observedData=observed.files.find(file=>file.path==='data.mjs');
  assert.ok(baselineData);
  assert.ok(observedData);
  assert.ok(!baselineData.code.includes('unrelatedLocal'),String(baselineData.code));
  assert.ok(baselineData.metrics.bindings>=1,String(baselineData.code));
  // The observed callable is in util.mjs; unrelated data.mjs locals remain
  // eligible for identifier rewriting across the same compilation graph.
  assert.ok(!observedData.code.includes('unrelatedLocal'),String(observedData.code));
  assert.ok(observedData.metrics.bindings>=1,String(observedData.code));
  assert.equal(await execute(baseline.files),baselineExpected);
  assert.equal(await execute(observed.files),observedExpected);
});
