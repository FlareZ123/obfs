'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const functionText='function inspect(){const hidden={secretField:17};return hidden.secretField;}';

/** @param {string} expression @returns {string} */
function fixture(expression) {
  return "'use strict';"+functionText+
    'const reference='+JSON.stringify(functionText)+';'+
    'const observed='+expression+';module.exports={observed,value:inspect()};';
}

/** @param {string} source @returns {string} */
function execute(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

for(const [name,expression] of [
  ['loose equality','inspect==reference'],
  ['loose inequality','inspect!=reference'],
  ['aliased loose equality','(()=>{const alias=inspect;return alias==reference;})()'],
  ['greater or equal','inspect>=reference'],
  ['reversed less or equal','reference<=inspect']
]) {
  test('loose/relational comparison can observe native function source: '+name,()=>{
    const original=fixture(expression);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'source-comparison/'+name,strings:true
    }).files[0];
    assert.equal(execute(result.code),execute(original),result.code);
    assert.equal(result.metrics.objects,0);
    assert.equal(result.metrics.bindings,0);
    assert.equal(result.metrics.literals,0);
  });
}

test('strict equality with string never coerces function source and permits own-key renaming',()=>{
  const original=fixture('inspect===reference');
  const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'source-comparison-strict',strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(original));
  assert.equal(result.metrics.objects,1);
});

test('AST source-observation guard distinguishes abstract from strict equality',()=>{
  assert.equal(observesFunctionSource(parse('function f(){}; f=="text";','commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){}; f==="text";','commonjs')),false);
});
