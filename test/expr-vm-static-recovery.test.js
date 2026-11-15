'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {virtualizeExpressionFunctions}=require('../sims/expr-vm');
const {recoverExpressionVm}=require('../sims/expr-vm-static-recover');

/** @param {string} code @returns {(...args:any[])=>unknown} */
function compile(code) {
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  assert.equal(typeof context.module.exports,'function');
  return /** @type {(...args:any[])=>unknown} */(context.module.exports);
}

/**
 * Compare primitive-value/exception behavior without comparing foreign realm
 * object prototypes, for this pure expression-only VM subset.
 * @param {(...args:any[])=>unknown} fn
 * @param {unknown[]} args
 * @returns {string}
 */
function observe(fn,args) {
  try {
    const result=fn(...args);
    return typeof result==='bigint'?'bigint:'+result.toString():
      typeof result==='number' && Number.isNaN(result)?'number:NaN':
        JSON.stringify([typeof result,result]);
  }catch(error){
    return 'error:'+/** @type {Error} */(error).name;
  }
}

for(const [name,expression] of [
  ['arithmetic/shift', '(((a^b)&255)>>>1)+((a|b)*3)'],
  ['unary/string/relational', '((typeof a)==="number")+(+b)+(-a)'],
  ['division/remainder/power', '((a**2)/(b+7))%(b-1)']
]) {
  test('recover public expression VM operators and operands without seed: '+name,()=>{
    const original='function compute(a,b){return '+expression+';}module.exports=compute;';
    const native=compile(original);
    for(const seed of ['first-unpublished-randomized-seed','second-unpublished-randomized-seed']) {
      const transformed=virtualizeExpressionFunctions(original,'commonjs',{seed,names:['compute']});
      assert.equal(transformed.functions,1);
      const recovered=recoverExpressionVm(transformed.code,'compute','commonjs');
      assert.equal(recovered.operations,transformed.instructions);
      assert.deepEqual(recovered.parameterNames,['a','b']);
      assert.ok(recovered.expression.includes('a'));
      assert.ok(recovered.expression.includes('b'));
      const replay=compile('function compute(a,b){return '+recovered.expression+';}module.exports=compute;');
      for(const args of [[0,0],[1,2],[-1,4],[500,2.5],[NaN,Infinity],
        ['5','7'],[true,false],[null,undefined],[9n,3n]]) {
        assert.equal(observe(replay,args),observe(native,args),
          name+' seed '+seed+' input '+args.map(String).join(','));
      }
      // The recovered executable expression is never taken from the input
      // source fixture. The attack only inspected the transformed source.
    }
  });
}
