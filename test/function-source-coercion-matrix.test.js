'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');

// Functions passed through native string coercion can expose exact source,
// even if a transformed function's body never reads another function's code.
const stringMethods=[
  'at','charAt','charCodeAt','codePointAt','concat','endsWith','includes',
  'indexOf','isWellFormed','lastIndexOf','localeCompare','match','matchAll',
  'normalize','padEnd','padStart','repeat','replace','replaceAll','search',
  'slice','split','startsWith','substring','toLocaleLowerCase',
  'toLocaleUpperCase','toLowerCase','toUpperCase','toWellFormed',
  'trim','trimEnd','trimStart',
  'anchor','big','blink','bold','fixed','fontcolor','fontsize','italics',
  'link','small','strike','sub','sup'
];
const regexpMethods=['test','exec','compile'];

/** @param {string} code @returns {boolean} */
function observed(code){
  return observesFunctionSource(parse('function f(a){return a^17;}'+code,'commonjs'));
}

test('native String prototype receiver coercion matrix preserves function and primitive distinctions',()=>{
  let guarded=0,eligible=0;
  for(const method of stringMethods){
    const nativeMethod='String.prototype.'+method;
    const sources=[
      nativeMethod+'.call(f);',
      nativeMethod+'.apply(f,[]);',
      nativeMethod+'.bind(f);',
      'const one='+nativeMethod+';const two=one;two.call(f);',
      'const fn='+nativeMethod+';Reflect.apply(fn,f,[]);'
    ];
    for(const source of sources){
      assert.equal(observed(source),true,'Native Function source not detected: '+method+' '+source);
      guarded++;
    }
    const primitive=nativeMethod+'.call("fixed literal");';
    assert.equal(observed(primitive),false,'Proven primitive should be eligible: '+method);
    eligible++;
  }
  assert.equal(guarded,stringMethods.length*5);
  assert.equal(eligible,stringMethods.length);
  console.log(JSON.stringify({family:'String receiver coercion',methods:stringMethods.length,
    negativeGuarded:guarded,primitiveEligible:eligible}));
});

test('native RegExp input coercion matrix follows method and bound aliases',()=>{
  let guarded=0,eligible=0;
  for(const method of regexpMethods){
    const nativeMethod='RegExp.prototype.'+method;
    const sources=[
      '/a/.'+method+'(f);',
      nativeMethod+'.call(/a/,f);',
      nativeMethod+'.apply(/a/,[f]);',
      'const one='+nativeMethod+';const two=one;two.call(/a/,f);',
      'const bound='+nativeMethod+'.bind(/a/);bound(f);',
      'Reflect.apply('+nativeMethod+',/a/,[f]);'
    ];
    for(const source of sources){
      assert.equal(observed(source),true,'Native Function source not detected: '+method+' '+source);
      guarded++;
    }
    assert.equal(observed('/a/.'+method+'("fixed literal");'),false,
      'Proven primitive should be eligible: '+method);
    eligible++;
  }
  assert.equal(guarded,regexpMethods.length*6);
  assert.equal(eligible,regexpMethods.length);
  console.log(JSON.stringify({family:'RegExp input coercion',methods:regexpMethods.length,
    negativeGuarded:guarded,primitiveEligible:eligible}));
});
