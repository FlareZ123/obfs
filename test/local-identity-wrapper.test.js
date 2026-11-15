'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute one CommonJS fixture without granting arbitrary filesystem access.
 * @param {string} source
 * @returns {string}
 */
function execute(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {string} wrapper
 * @param {number} expectedObjects
 * @returns {void}
 */
function check(wrapper,expectedObjects) {
  const code='const root={secretField:7,secondField:5};'+wrapper+
    'const alias=forward(root);module.exports=[alias.secretField,root.secondField];';
  const baseline=execute(code);
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
      mode,seed:'agent15-local-wrapper',strings:false,identifiers:false
    }).files[0];
    assert.equal(out.metrics.objects,expectedObjects,out.code);
    assert.equal(execute(/** @type {string} */ (out.code)),baseline,mode);
    if(expectedObjects)assert.doesNotMatch(/** @type {string} */ (out.code),/\.secretField/u);
  }
}

for(const [name,wrapper] of [
  ['concise arrow','const forward=value=>value;'],
  ['parenthesized arrow','const forward=(value)=>value;'],
  ['block arrow','const forward=value=>{return value;};'],
  ['anonymous function expression','const forward=function(value){return value;};'],
  ['named function expression','const forward=function inner(value){return value;};'],
  ['original function declaration','function forward(value){return value;}']
]) {
  test('local pure identity supports own-property rename: '+name,()=>check(wrapper,1));
}

for(const [name,wrapper] of [
  ['async arrow is not a synchronous identity',
    'const forward=async value=>value;'],
  ['side-effectful arrow is opaque',
    'const forward=value=>(Object.keys(value),value);'],
  ['default parameter is not a plain parameter',
    'const forward=(value,peek=Object.keys(value))=>value;'],
  ['mutable let helper is not immutable',
    'let forward=value=>value;'],
  ['callback-escaped helper',
    'const forward=value=>value;const escape=forward;'],
  ['exported helper is observable by outside callers',
    'const forward=value=>value;module.exports.forward=forward;']
]) {
  test('unproved local identity is left unchanged: '+name,()=>check(wrapper,0));
}

test('a helper called with an opaque foreign object cannot capture the private owner',()=>{
  const code='const root={secretField:7};const forward=x=>x;'+
    'const alien={secretField:9};const unrelated=forward(alien);'+
    'const alias=forward(root);module.exports=[unrelated.secretField,alias.secretField];';
  const baseline=execute(code);
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    const out=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
      mode,seed:'agent15-foreign-call',strings:false,identifiers:false
    }).files[0];
    assert.equal(execute(/** @type {string} */ (out.code)),baseline);
    // An unrelated call cannot be treated as an object ownership proof.
    assert.equal(out.metrics.objects,0);
  }
});
