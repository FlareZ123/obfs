'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {neutralizeHashedNames}=require('../sims/offline-normalize');

/**
 * Execute a CommonJS snippet in a separate VM context.
 * @param {string} code
 * @returns {string}
 */
function execute(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {string} local
 * @param {boolean} eligible
 * @returns {void}
 */
function check(local,eligible) {
  const source='const root={privateMetric:7,otherMetric:11};'+local;
  const expected=execute(source);
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    const compiled=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'root-getter-proof',strings:false,identifiers:false
    }).files[0];
    assert.equal(compiled.metrics.objects,eligible?1:0,compiled.code);
    assert.equal(compiled.metrics.properties,eligible?2:0,compiled.code);
    assert.equal(execute(/** @type {string} */ (compiled.code)),expected);
    if(eligible) {
      assert.doesNotMatch(/** @type {string} */ (compiled.code),/\.privateMetric\b/u);
      const attack=neutralizeHashedNames([{
        path:'entry.cjs',sourceType:'commonjs',code:/** @type {string} */ (compiled.code)
      }]);
      assert.equal(attack.properties,2);
      assert.equal(execute(attack.files[0].code),expected);
    }
  }
}

for(const [name,local] of [
  ['const concise arrow',
    'const get=()=>root;const alias=get();'+
    'module.exports=[alias.privateMetric,root.otherMetric];'],
  ['const block arrow',
    'const get=()=>{return root;};let alias=get();'+
    'module.exports=[alias.privateMetric,root.otherMetric];'],
  ['const named function expression',
    'const get=function inner(){return root;};const alias=get();'+
    'module.exports=[alias.privateMetric,root.otherMetric];'],
  ['function declaration and discarded invocation',
    'function get(){return root;}get();const alias=get();'+
    'module.exports=[alias.privateMetric,root.otherMetric];']
]) {
  test('local zero-arg immutable getter is proven: '+name,()=>check(local,true));
}

for(const [name,local] of [
  ['call result used as a member without tracked binding',
    'const get=()=>root;module.exports=get().privateMetric;'],
  ['call result directly escapes through module output',
    'const get=()=>root;module.exports=[get(),root.privateMetric];'],
  ['getter escapes through callback alias',
    'const get=()=>root;const callback=get;const alias=get();'+
    'module.exports=[alias.privateMetric,root.otherMetric,typeof callback];'],
  ['exported getter escapes to the ambient environment',
    'const get=()=>root;globalThis.outside=get;const alias=get();'+
    'module.exports=[alias.privateMetric,root.otherMetric];'],
  ['async getter is a promise rather than the object',
    'const get=async()=>root;const alias=get();'+
    'module.exports=[root.privateMetric,alias instanceof Promise];'],
  ['parameterized closure is not in the admitted shape',
    'const get=unused=>root;const alias=get();'+
    'module.exports=[alias.privateMetric,root.otherMetric];'],
  ['effectful getter is not pure',
    'const get=()=>{Object.keys(root);return root;};const alias=get();'+
    'module.exports=[alias.privateMetric,root.otherMetric];'],
  ['root escapes as a returned JSON object',
    'const get=()=>root;const alias=get();'+
    'module.exports={root,value:alias.privateMetric};']
]) {
  test('unproven local zero-arg getter declines: '+name,()=>check(local,false));
}

for(const code of [
  'const root={privateMetric:7,otherMetric:11};'+
  'export const get=()=>root;export const result=root.privateMetric;',
  'const root={privateMetric:7,otherMetric:11};'+
  'export function get(){return root;}export const result=root.privateMetric;'
]) {
  test('publicly exported zero-arg getters prevent private shape renaming',()=>{
    const compiled=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code}],{
      mode:'coo',seed:'exported-root-getter',strings:false,identifiers:false
    }).files[0];
    assert.equal(compiled.metrics.objects,0,compiled.code);
    assert.equal(compiled.metrics.properties,0,compiled.code);
    assert.match(/** @type {string} */ (compiled.code),/privateMetric/u);
  });
}
