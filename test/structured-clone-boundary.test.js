'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute CJS in a fresh realm with the Node 22 host clone capability.
 * The exported JSON string makes cross-realm prototypes irrelevant.
 * @param {string} code
 * @returns {string}
 */
function evaluate(code){
  const context={module:{exports:''},structuredClone};
  vm.runInNewContext(code,context,{filename:'clone-observer.cjs',timeout:3000});
  return /** @type {string} */ (context.module.exports);
}

/**
 * @param {string} code
 * @param {number} propertyCount
 * @returns {void}
 */
function check(code,propertyCount){
  const native=evaluate(code);
  for(const mode of /** @type {const} */ (['coo','sno'])){
    const emitted=obfuscateFiles([{
      path:'clone-observer.cjs',sourceType:'commonjs',code
    }],{mode,seed:'clone-observer-'+mode,strings:false,identifiers:false});
    assert.equal(emitted.files[0].metrics.properties,propertyCount,
      'unexpected property rewrite for '+mode+' in '+code);
    assert.equal(evaluate(/** @type {string} */(emitted.files[0].code)),native,
      'semantic mismatch for '+mode+' in '+code);
  }
}

test('unexposed locally owned property remains eligible',()=>{
  check('const state={secretField:73};module.exports=JSON.stringify(state.secretField);',1);
});

const copyForms=[
  'structuredClone(state)',
  'globalThis.structuredClone(state)',
  '(0,structuredClone)(state)',
  'clone(state)',
  'copy(state)',
  'runClone(state)',
  'Reflect.apply(structuredClone,null,[state])',
  'holder.clone(state)',
  'clone.call(null,state)'
];

const introductions=[
  '',
  '',
  '',
  'const clone=structuredClone;',
  'const {structuredClone:copy}=globalThis;',
  'function runClone(value){return structuredClone(value);}',
  '',
  'const holder={clone:structuredClone};',
  'const clone=structuredClone;'
];

for(let index=0;index<copyForms.length;index++){
  test('host structuredClone copied own-key exposure '+index,()=>{
    const code='const state={secretField:73};'+introductions[index]+
      'const cloned='+copyForms[index]+';'+
      'module.exports=JSON.stringify(['+
      'Reflect.ownKeys(cloned),cloned.secretField,state.secretField]);';
    check(code,0);
  });
}
