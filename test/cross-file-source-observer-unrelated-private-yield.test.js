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
    'import {unrelatedRecord,unrelatedValue} from "./data.mjs";',
    ...(observe?['console.log(inspect.toString());']:[]),
    'console.log(inspect(),unrelatedRecord.unrelatedPrivate,unrelatedValue);'
  ].join('\n');
  return [
    {path:'util.mjs',sourceType:'module',code:[
      'const privateState={secretField:3};',
      'export function inspect(){return privateState.secretField;}'
    ].join('\n')},
    {path:'data.mjs',sourceType:'module',code:[
      'export const unrelatedRecord={unrelatedPrivate:7};',
      'export const unrelatedValue=(()=>{const unrelatedLocal=11;return unrelatedLocal;})();'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ];
}

test('source observation in one module and unrelated cross-file rename scopes',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-source-observer-unrelated-'));
  /** @param {{path:string,code:string}[]} sources */
  async function execute(sources) {
    for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }
  const baselineFiles=makeFiles(false);
  const observedFiles=makeFiles(true);
  try {
    const baselineExpected=await execute(baselineFiles);
    const observedExpected=await execute(observedFiles);

    const propertyOptions={
      mode:'coo',closedWorld:true,seed:'source-observer-unrelated-property',
      properties:true,identifiers:false,strings:false
    };
    const propertyBaseline=obfuscateFiles(baselineFiles,propertyOptions);
    const propertyObserved=obfuscateFiles(observedFiles,propertyOptions);
    const baselineData=propertyBaseline.files.find(file=>file.path==='data.mjs');
    const observedData=propertyObserved.files.find(file=>file.path==='data.mjs');
    assert.ok(baselineData);
    assert.ok(observedData);
    assert.ok(!baselineData.code.includes('unrelatedPrivate'),String(baselineData.code));
    assert.ok(baselineData.metrics.properties>=1,String(baselineData.code));
    // Expected-red witness: the entry observer currently suppresses a private
    // cross-file property that is not present in inspect's source text.
    assert.ok(observedData.code.includes('unrelatedPrivate'),String(observedData.code));
    assert.equal(observedData.metrics.properties,0,String(observedData.code));
    assert.equal(await execute(propertyBaseline.files),baselineExpected);
    assert.equal(await execute(propertyObserved.files),observedExpected);

    const identifierOptions={
      mode:'coo',closedWorld:true,seed:'source-observer-unrelated-identifier',
      properties:false,identifiers:true,strings:false
    };
    const identifierBaseline=obfuscateFiles(baselineFiles,identifierOptions);
    const identifierObserved=obfuscateFiles(observedFiles,identifierOptions);
    const baselineIdentifierData=identifierBaseline.files.find(file=>file.path==='data.mjs');
    const observedIdentifierData=identifierObserved.files.find(file=>file.path==='data.mjs');
    assert.ok(baselineIdentifierData);
    assert.ok(observedIdentifierData);
    assert.ok(!baselineIdentifierData.code.includes('unrelatedLocal'),String(baselineIdentifierData.code));
    assert.ok(baselineIdentifierData.metrics.bindings>=1,String(baselineIdentifierData.code));
    // The same compilation-unit source observer also blocks the unrelated
    // module's private local binding under the identifier-only pass.
    assert.ok(observedIdentifierData.code.includes('unrelatedLocal'),String(observedIdentifierData.code));
    assert.equal(observedIdentifierData.metrics.bindings,0,String(observedIdentifierData.code));
    assert.equal(await execute(identifierBaseline.files),baselineExpected);
    assert.equal(await execute(identifierObserved.files),observedExpected);

    console.log(JSON.stringify({
      baselinePropertyMetrics:baselineData.metrics,
      observedPropertyMetrics:observedData.metrics,
      baselineIdentifierMetrics:baselineIdentifierData.metrics,
      observedIdentifierMetrics:observedIdentifierData.metrics,
      unrelatedPropertyRenamedWithoutObserver:true,
      unrelatedPropertyFrozenWithObserver:true,
      unrelatedBindingRenamedWithoutObserver:true,
      unrelatedBindingFrozenWithObserver:true,
      runtimeAndObservedSourceParity:true
    }));
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
