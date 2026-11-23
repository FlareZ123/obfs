'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {boolean} observe @returns {{path:string,sourceType:'module',code:string}[]} */
function makeFiles(observe) {
  const entry=[
    'import {inspect} from "./util.mjs";',
    'import {unrelatedValue} from "./data.mjs";',
    ...(observe?['console.log(inspect.toString());']:[]),
    'console.log(inspect(),unrelatedValue);'
  ].join('\n');
  return [
    {path:'util.mjs',sourceType:'module',code:[
      'const privateState={secretField:3};',
      'export function inspect(){return privateState.secretField;}'
    ].join('\n')},
    {path:'data.mjs',sourceType:'module',code:[
      'const privateOwner={unrelatedPrivate:7};',
      'function privateReader(){const unrelatedLocal=11;return privateOwner.unrelatedPrivate+unrelatedLocal;}',
      'export const unrelatedValue=privateReader();'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ];
}

test('source observation of an imported callable does not freeze unrelated module state',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-source-observer-unrelated-'));
  /** @param {{path:string,code:string}[]} sources */
  async function execute(sources) {
    for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }
  const options={
    mode:'coo',closedWorld:true,seed:'source-observer-unrelated-module-yield',
    properties:true,identifiers:true,strings:false
  };
  try {
    const baselineFiles=makeFiles(false);
    const baselineExpected=await execute(baselineFiles);
    const baseline=obfuscateFiles(baselineFiles,options);
    const baselineData=baseline.files.find(file=>file.path==='data.mjs');
    assert.ok(baselineData);
    assert.ok(!baselineData.code.includes('unrelatedPrivate'),String(baselineData.code));
    assert.ok(!baselineData.code.includes('unrelatedLocal'),String(baselineData.code));
    assert.ok(baselineData.metrics.properties>=1,String(baselineData.code));
    assert.ok(baselineData.metrics.bindings>=1,String(baselineData.code));
    assert.equal(await execute(baseline.files),baselineExpected);

    const observedFiles=makeFiles(true);
    const observedExpected=await execute(observedFiles);
    const observed=obfuscateFiles(observedFiles,options);
    const util=observed.files.find(file=>file.path==='util.mjs');
    const data=observed.files.find(file=>file.path==='data.mjs');
    assert.ok(util);
    assert.ok(data);
    assert.ok(util.code.includes('secretField'),'observed callable property spelling must remain');
    // Expected-red witness for the current compilation-unit-wide veto: the
    // observer is attached to util.inspect, but unrelated data.mjs names are
    // also frozen even though they do not occur in that callable's source.
    assert.ok(data.code.includes('unrelatedPrivate'),String(data.code));
    assert.ok(data.code.includes('unrelatedLocal'),String(data.code));
    assert.equal(data.metrics.properties,0,String(data.code));
    assert.equal(data.metrics.bindings,0,String(data.code));
    assert.equal(await execute(observed.files),observedExpected);
    console.log(JSON.stringify({
      baselineDataMetrics:baselineData.metrics,
      observedUtilMetrics:util.metrics,
      observedDataMetrics:data.metrics,
      unrelatedPropertyRenamed:false,
      unrelatedBindingRenamed:false,
      runtimeAndObservedSourceParity:true
    }));
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
