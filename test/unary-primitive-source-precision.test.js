'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function protectedSource(){
  let result='(input|0)';
  for(const step of [17,-8,213,-55,64,-2,34,-10]){
    result='('+result+(step>=0?'+':'')+step+')';
  }
  return 'function protectedSum(input){return ('+result+'|0);}\n';
}

/** @param {string} observer @returns {string} */
function input(observer){
  return protectedSource()+observer;
}

/** @param {string} source @returns {unknown} */
function evaluate(source) {
  /** @type {{exports:unknown}} */
  const module={exports:undefined};
  Function('module','exports',source)(module,module.exports);
  return module.exports;
}

/** @param {string} source @returns {ReturnType<typeof obfuscateFiles>} */
function obfuscate(source) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'coo',seed:'unary-source-proof',
    strings:false,identifiers:false,properties:false,
    experimentalPolyvariantAffine:{'entry.cjs':['protectedSum']},
    experimentalPolyvariantCount:2
  });
}

for(const [name,expr,want] of [
  ['typeof identifier','typeof protectedSum','function!'],
  ['void identifier','void protectedSum','undefined!'],
  ['logical not identifier','!protectedSum','false!'],
  ['typeof through alias','typeof alias','function!']
]) {
  test('primitive unary '+name+' cannot expose protected function source',()=>{
    const alias=name.includes('alias')?'const alias=protectedSum;':'';
    const source=input(alias+'module.exports=('+expr+')+"!";');
    assert.equal(evaluate(source),want);
    const output=obfuscate(source);
    assert.equal(output.files[0].metrics.polyvariantFunctions,1);
    assert.equal(evaluate(String(output.files[0].code)),want);
  });
}

test('primitive unary locals stay proven through string concatenation',()=>{
  const source=input('const type=typeof protectedSum;const nothing=void protectedSum;'+
    'const falsehood=!protectedSum;'+
    'module.exports=type+":"+nothing+":"+falsehood;');
  const result=obfuscate(source);
  assert.equal(result.files[0].metrics.polyvariantFunctions,1);
  assert.equal(evaluate(String(result.files[0].code)),evaluate(source));
});

for(const observer of [
  'module.exports="source:"+protectedSum;',
  'module.exports=String(protectedSum);'
]) {
  test('direct function-source coercion still prevents a body rewrite',()=>{
    const source=input(observer);
    assert.throws(()=>obfuscate(source),/(?:source observation|declined)/i);
  });
}
