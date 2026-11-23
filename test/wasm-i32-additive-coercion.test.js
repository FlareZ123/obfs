'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

/**
 * Strictly typed signed i32 Number inputs: no dynamic coercion, getters,
 * externally patched operators or -0. Result expressions have an explicit
 * bitwise ToInt32 boundary before returning to the JavaScript caller.
 * @param {string} source
 * @returns {(...args:number[])=>number}
 */
function load(source){
  /** @type {{exports:unknown}} */
  const module={exports:null};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return /** @type {(...args:number[])=>number} */ (module.exports);
}

let state=0x61c88647;
/** @returns {number} */
function next(){
  state^=state<<13;state^=state>>>17;state^=state<<5;
  return state|0;
}
const boundaries=[-2147483648,-2147483647,-65536,-1,0,1,2,65535,2147483646,2147483647];

/** @type {Array<{parameters:string[],expression:string}>} */
const positive=[
  {parameters:['a','b'],expression:'((a+b)|0)'},
  {parameters:['a','b'],expression:'((a+b)>>>0)'},
  {parameters:['a','b'],expression:'(~(a+b))'},
  {parameters:['a','b','c'],expression:'((((a+b)+(c>>>0))>>>0)^(a<<2))'},
  {parameters:['a','b'],expression:'(((a+b)|0)?((a+(b>>>0))|0):(a^b))'},
  {parameters:['a','b'],expression:'(((a+b)&1)^((~(a+b))|(a>>>3)))'},
  {parameters:['a','b'],expression:'((a+(b>>>0))<<((a+b)&31))'}
];

test('Wasm i32 admits bounded additive expressions only under explicit bitwise coercion',()=>{
  let comparisons=0;
  for(let expressionIndex=0;expressionIndex<positive.length;expressionIndex++){
    const fixture=positive[expressionIndex];
    const source='function f('+fixture.parameters.join(',')+'){return '+
      fixture.expression+';}module.exports=f;';
    const native=load(source);
    for(let seedIndex=0;seedIndex<3;seedIndex++){
      const compiled=lowerWasmI32Functions(source,'commonjs',{
        seed:'bounded-coerced-add-'+expressionIndex+'/'+seedIndex,names:['f']
      });
      assert.equal(compiled.functions,1,fixture.expression);
      assert.equal(compiled.declined,0);
      const emitted=load(compiled.code);
      // The embedded i32.add is public, not a secret or an anti-debugging key.
      const recovered=recoverPublicWasmExpression(compiled.code,fixture.parameters);
      const cloned=load('function f('+fixture.parameters.join(',')+
        '){return '+recovered.expression+
        (fixture.expression.includes('>>>0')&&fixture.expression.startsWith('((a+b)>>>')?
          ';}module.exports=f;':';}module.exports=f;'));
      for(let sample=0;sample<160;sample++){
        const values=fixture.parameters.map((_,index)=>sample<boundaries.length?
          boundaries[(sample+index)%boundaries.length]:next());
        const result=native(...values);
        assert.ok(Object.is(emitted(...values),result),
          'emitted/native disagreement at '+expressionIndex+'/'+seedIndex+'/'+sample);
        assert.ok(Object.is(cloned(...values),result),
          'bytecode-only clone disagreement at '+expressionIndex+'/'+seedIndex+'/'+sample);
        comparisons++;
      }
    }
  }
  assert.equal(comparisons,positive.length*3*160);
});

test('uncoerced sum and conditional test stay outside the additive grammar',()=>{
  for(const expr of [
    'a+b',
    '(a+b)?1:2',
    '((a+b)?1:2)|0',
    'a?((a+b)|0):(a+b)',
    'a+(b|0)',
    '((a+b)+0.5)|0',
    '(a+(b*3))|0',
    '((a+b)+Infinity)|0'
  ]){
    const source='function f(a,b){return '+expr+';}module.exports=f;';
    const compiled=lowerWasmI32Functions(source,'commonjs',{
      seed:'additive-rejection',names:['f']
    });
    assert.equal(compiled.functions,0,expr);
    assert.equal(compiled.declined,1,expr);
    assert.equal(compiled.code,source,expr);
  }
});
