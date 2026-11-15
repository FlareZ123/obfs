'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Evaluate CommonJS in an independent context with an opaque host callback.
 * The compiler receives only the source. The bridge is attacker-controlled
 * outside the transformed file group, but is a legitimate runtime dependency.
 *
 * @param {string} source
 * @param {(value:Function)=>unknown} bridge
 * @returns {unknown}
 */
function evaluate(source,bridge) {
  const context={module:{exports:null},hostBridge:bridge};
  vm.runInNewContext(source,context,{filename:'opaque-source.cjs',timeout:2000});
  return context.module.exports;
}

/** @param {string} source @returns {string} */
function transformCjs(source) {
  return /** @type {string} */ (obfuscateFiles([{
    path:'opaque-source.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed:'agent50-external-function-contract',strings:false,properties:false})
    .files[0].code);
}

/**
 * Compare strictly observable behavior under the same host callback, which
 * may introspect function source text or error stack coordinates.
 *
 * @returns {Promise<{
 *   opaqueSourceValuePreserved:boolean,
 *   opaqueFunctionSourceChanged:boolean,
 *   opaqueErrorStackChanged:boolean,
 *   exportedFunctionSourceChanged:boolean,
 *   exportedFunctionResultPreserved:boolean,
 *   noObserverValuePreserved:boolean,
 *   refactorRequired:string
 * }>}
 */
async function studyOpaqueSourceContract() {
  const source=[
    "'use strict';",
    'function compute(){const significantLocal=37;return significantLocal;}',
    'module.exports=hostBridge(compute);'
  ].join('');
  /** @param {Function} fn */
  const inspectSource=fn=>({
    value:fn(),
    source:Function.prototype.toString.call(fn)
  });
  const native=/** @type {{value:number,source:string}} */ (evaluate(source,inspectSource));
  const changed=/** @type {{value:number,source:string}} */ (evaluate(transformCjs(source),inspectSource));
  assert.equal(native.value,changed.value);
  assert.notEqual(native.source,changed.source,
    'Opaque host source consumer unexpectedly received byte-identical text');
  const plainNative=evaluate(source,(/** @type {Function} */ fn)=>fn());
  const plainTransformed=evaluate(transformCjs(source),(/** @type {Function} */ fn)=>fn());
  assert.equal(plainNative,plainTransformed);

  const stackSource=[
    "'use strict';",
    'function thrower(){const significantLocal=37;throw Error("problem-"+significantLocal);}',
    'module.exports=hostBridge(thrower);'
  ].join('');
  /** @param {Function} fn */
  const captureLocation=fn=>{
    try {fn();return 'unexpected-no-throw';}
    catch(error) {
      const stack=/** @type {{stack?:string}} */ (error).stack??'';
      return stack.match(/opaque-source\.cjs:\d+:\d+/u)?.[0]??'unavailable';
    }
  };
  const originalStack=evaluate(stackSource,captureLocation);
  const changedStack=evaluate(transformCjs(stackSource),captureLocation);
  assert.notEqual(originalStack,'unavailable');
  assert.notEqual(changedStack,'unavailable');
  assert.notEqual(originalStack,changedStack,
    'Opaque external stack inspection unexpectedly remained unchanged');

  const exported='function exported(){const localBinding=23;return localBinding;}export {exported};';
  const transformed=obfuscateFiles([{
    path:'visible.mjs',sourceType:'module',code:exported
  }],{mode:'coo',strings:false,properties:false,seed:'agent50-unobserved-export'}).files[0];
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-opaque-source-'));
  let exportedFunctionSourceChanged=false;
  let exportedFunctionResultPreserved=false;
  try {
    const originalPath=path.join(directory,'original.mjs');
    const obfuscatedPath=path.join(directory,'obfuscated.mjs');
    await atomicWrite(originalPath,exported);
    await atomicWrite(obfuscatedPath,transformed.code);
    const originalModule=await import(pathToFileURL(originalPath).href);
    const obfuscatedModule=await import(pathToFileURL(obfuscatedPath).href);
    const originalFn=/** @type {()=>number} */ (originalModule.exported);
    const obfuscatedFn=/** @type {()=>number} */ (obfuscatedModule.exported);
    exportedFunctionResultPreserved=originalFn()===obfuscatedFn();
    exportedFunctionSourceChanged=
      Function.prototype.toString.call(originalFn)!==
      Function.prototype.toString.call(obfuscatedFn);
    assert.ok(exportedFunctionResultPreserved);
    assert.ok(exportedFunctionSourceChanged,
      'Expected separately exported function source to change');
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }

  return {
    opaqueSourceValuePreserved:native.value===changed.value,
    opaqueFunctionSourceChanged:native.source!==changed.source,
    opaqueErrorStackChanged:originalStack!==changedStack,
    exportedFunctionSourceChanged,
    exportedFunctionResultPreserved,
    noObserverValuePreserved:plainNative===plainTransformed,
    refactorRequired:'No compiler can change an externally observed function source string while preserving exact Function.prototype.toString output. Fix requires an explicit semantic compatibility policy and selective transform refusal at unknown function escape boundaries.'
  };
}

if(require.main===module) {
  studyOpaqueSourceContract().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={studyOpaqueSourceContract};
