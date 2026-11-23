'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {{path:string,code:string}[]} files @returns {Promise<string>} */
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

test('source observer for imported callable leaves unrelated cross-file property renameable',async()=>{
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
  const observedUtil=observed.files.find(file=>file.path==='util.mjs');
  assert.ok(baselineState);
  assert.ok(observedState);
  assert.ok(observedUtil);
  assert.ok(!baselineState.code.includes('unrelatedPrivate'),String(baselineState.code));
  assert.ok(baselineState.metrics.properties>=1,String(baselineState.code));
  // The source observer is attached to util.inspect. The separate state.mjs
  // property is not present in inspect's source and remains safely renameable.
  assert.ok(!observedState.code.includes('unrelatedPrivate'),String(observedState.code));
  assert.ok(observedUtil.code.includes('secretField'),String(observedUtil.code));
  assert.equal(await execute(baseline.files),baselineExpected);
  assert.equal(await execute(observed.files),observedExpected);
  console.log(JSON.stringify({
    baselineStateMetrics:baselineState.metrics,
    observedStateMetrics:observedState.metrics,
    observedUtilMetrics:observedUtil.metrics,
    unrelatedPropertyRenamedWithObserver:true,
    observedCallableSourcePreserved:true,
    runtimeParity:true
  }));
});
