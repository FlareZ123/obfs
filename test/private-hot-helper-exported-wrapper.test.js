'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Compile a real CommonJS export in a fresh VM realm.
 * @param {string} code
 * @returns {(n:number)=>number}
 */
function compile(code) {
  /** @type {{exports:((n:number)=>number)|null}} */
  const module={exports:null};
  vm.runInNewContext(code,{module},{timeout:3000});
  assert.equal(typeof module.exports,'function');
  return module.exports;
}

test('private direct-call hot helper preserves exported source and retains an own-property rewrite',()=>{
  const source='const state={counter:0};'+
    'function tick(n){for(let i=0;i<n;i++){state.counter++;}return state.counter;}'+
    'function run(n){return tick(n);}module.exports=run;';
  const emitted=obfuscateFiles([{path:'workload.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'public-wrapper-private-hot-loop',strings:false,identifiers:false,
    properties:true,preservePublicCallableSource:true
  });
  const result=emitted.files[0];
  assert.equal(result.metrics.properties,1,
    'Private helper hot loop must still actually rename its own key');
  assert.ok(!String(result.code).includes('state.counter'),
    'All hot-loop property reads and updates must use the transformed field');
  const original=compile(source);
  const protectedRun=compile(String(result.code));
  assert.equal(Function.prototype.toString.call(protectedRun),
    Function.prototype.toString.call(original),
    'The public CommonJS function source remains externally observable');
  for(const n of [0,1,100,100000,100000]) {
    assert.equal(protectedRun(n),original(n),
      'Native and private-helper transformed function must have equal stateful outputs');
  }
});
