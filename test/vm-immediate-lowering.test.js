'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {lowerImmediateFunction}=require('../workplace/experimental-vm-lower');

/** @param {string} source @returns {(input:unknown)=>unknown} */
function compile(source) {
  /** @type {{module:{exports:unknown}}} */
  const realm={module:{exports:null}};
  vm.runInNewContext(source,realm,{timeout:1000});
  assert.equal(typeof realm.module.exports,'function');
  return /** @type {(input:unknown)=>unknown} */ (realm.module.exports);
}

/** @param {(input:unknown)=>unknown} fn @param {unknown} input @returns {{ok:boolean,value:unknown}} */
function observe(fn,input) {
  try{return {ok:true,value:fn(input)};}
  catch(error) {
    const exception=/** @type {Error} */ (error);
    return {ok:false,value:exception.name+': '+exception.message};
  }
}

for(const [description,expression] of [
  ['arithmetic and XOR','(((x+7)*3)^90)'],
  ['subtraction, shifts, and unsigned shift','(((x-12)<<3)>>>1)'],
  ['bitwise and, bitwise or','(((x&255)|16)^51)']
]) {
  test('experimental VM matches native JS primitive semantics: '+description,()=>{
    const source='function calculate(x){return '+expression+';}module.exports=calculate;';
    const candidate=lowerImmediateFunction(source,'calculate',{sourceType:'commonjs',seed:description});
    assert.equal(candidate.transformed,true,candidate.reason);
    assert.ok(candidate.bytecode.length>=3);
    assert.notEqual(candidate.code,source);
    const native=compile(source);
    const virtual=compile(candidate.code);
    assert.equal(virtual.name,native.name);
    assert.equal(virtual.length,native.length);
    for(const input of [
      -2147483648,-4294967295,-1,-0,0,1,17,2147483647,4294967295,
      Number.MAX_SAFE_INTEGER,NaN,Infinity,-Infinity,'5','',null,undefined,
      true,false,BigInt(1),Symbol('test')
    ]) {
      assert.deepEqual(observe(virtual,input),observe(native,input),
        'Input '+String(input));
    }
    let conversions=0;
    const input={
      [Symbol.toPrimitive]() {
        conversions++;
        return 13;
      }
    };
    assert.deepEqual(observe(virtual,input),observe(native,input));
    assert.equal(conversions,2,'Both executions must make one coercion');
  });
}

test('experimental VM fails closed on unsupported expressions and source observers',()=>{
  for(const source of [
    'function calculate(x){return x*999;}module.exports=calculate;',
    'function calculate(x){return x.someProperty+7;}module.exports=calculate;',
    'function calculate(x,y){return x+7;}module.exports=calculate;',
    'function calculate(x){const local=7;return x+local;}module.exports=calculate;',
    'function calculate(x){return x+7;}module.exports=calculate.toString();'
  ]) {
    const candidate=lowerImmediateFunction(source,'calculate',{sourceType:'commonjs'});
    assert.equal(candidate.transformed,false);
    assert.equal(candidate.code,source);
  }
});
