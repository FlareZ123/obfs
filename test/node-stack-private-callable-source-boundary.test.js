'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * A Node host can replace a mutable intrinsic before loading application
 * code. V8's structured stack callback then sees a direct-call-only helper
 * even though the application never exports that helper.
 *
 * @param {string} code
 * @param {boolean} [hostReturnsObservedSourceByte]
 * @returns {{result:number,helperSource:string}}
 */
function observeUnderHostStackFormatter(code,hostReturnsObservedSourceByte=false) {
  const context=vm.createContext({module:{exports:null}});
  vm.runInContext([
    'Error.prepareStackTrace=(error,frames)=>{',
    '  const frame=frames.find(item=>item.getFunctionName()==="privateHelper");',
    '  return frame&&typeof frame.getFunction()==="function"?',
    '    String(frame.getFunction()):"unavailable";',
    '};',
    'Math.random=()=>{globalThis.capturedHelper=new Error().stack;return '+
      (hostReturnsObservedSourceByte?'Number(globalThis.capturedHelper.includes("secretLocal"));':'0;')+'};'
  ].join('\n'),context);
  vm.runInContext(code,context);
  const result=Number(vm.runInContext('module.exports()',context));
  const helperSource=String(vm.runInContext('globalThis.capturedHelper',context));
  return {result,helperSource};
}

test('a controlling Node host observes transformed source inside a direct-call-only helper',()=>{
  const source='function privateHelper(secretLocal){return secretLocal+Math.random();}'+
    'module.exports=function publicReader(){return privateHelper(17);};';
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'entry.cjs',sourceType:'commonjs',code:source}];
  const output=obfuscateFiles(files,{
    mode:'sno',seed:'node-stack-source-boundary-20261122',
    strings:false,properties:false,identifiers:true,
    preservePublicCallableSource:true
  });
  const emitted=String(output.files[0].code);
  const renamed=output.files[0].metrics.bindings??0;
  assert.ok(renamed>0,'The selected private helper must actually be transformed');
  assert.doesNotMatch(emitted,/\bsecretLocal\b/);
  const native=observeUnderHostStackFormatter(source);
  const obfuscated=observeUnderHostStackFormatter(emitted);
  assert.equal(native.result,17);
  assert.equal(obfuscated.result,17);
  assert.match(native.helperSource,/\bsecretLocal\b/);
  assert.doesNotMatch(obfuscated.helperSource,/\bsecretLocal\b/);
  assert.notEqual(obfuscated.helperSource,native.helperSource);
  process.stdout.write('NODE_STACK_PRIVATE_CALLABLE_SOURCE_BOUNDARY '+
    JSON.stringify({mode:'sno',renamedBindings:renamed,
      nativeResult:native.result,obfuscatedResult:obfuscated.result,
      sourceRecovered:true,sourceIdentical:false})+'\n');
});

test('host-selected result depends on the dynamically recovered private helper source',()=>{
  const source='function privateHelper(secretLocal){return secretLocal+Math.random();}'+
    'module.exports=function publicReader(){return privateHelper(17);};';
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'node-stack-observed-value-20261122',
    strings:false,properties:false,identifiers:true,
    preservePublicCallableSource:true
  });
  assert.ok(output.files[0].metrics.bindings>0);
  const native=observeUnderHostStackFormatter(source,true);
  const emitted=observeUnderHostStackFormatter(String(output.files[0].code),true);
  assert.equal(native.result,18);
  assert.equal(emitted.result,17);
  assert.notEqual(native.result,emitted.result);
  process.stdout.write('NODE_STACK_HOST_VALUE_COUNTEREXAMPLE '+
    JSON.stringify({mode:'sno',nativeResult:native.result,
      emittedResult:emitted.result,sourceVisibleToHost:true})+'\n');
});
