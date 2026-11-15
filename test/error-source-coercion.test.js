'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} source @returns {string} */
function execute(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} expression @returns {string} */
function fixture(expression) {
  return "'use strict';const state={secretField:37};"+
    "function inspect(){const marker='inside-error-source';return state.secretField+marker.length;}"+
    "const observed="+expression+";module.exports={observed,value:inspect()};";
}

for(const [name,expression] of [
  ['Error as function','Error(inspect).message'],
  ['new Error','new Error(inspect).message'],
  ['TypeError','TypeError(inspect).message'],
  ['new RangeError','new RangeError(inspect).message'],
  ['SyntaxError','new SyntaxError(inspect).message'],
  ['ReferenceError','new ReferenceError(inspect).message'],
  ['URIError','new URIError(inspect).message'],
  ['EvalError','new EvalError(inspect).message'],
  ['AggregateError second parameter','new AggregateError([],inspect).message'],
  ['aliased Error constructor','(()=>{const E=Error;return E(inspect).message;})()'],
  ['global Error constructor','(()=>{const Root=globalThis;const E=Root.Error;return E(inspect).message;})()'],
  ['Error.call','Error.call(null,inspect).message'],
  ['Error.apply','Error.apply(null,[inspect]).message']
]) {
  test('error constructor exposes function source: '+name,()=>{
    const original=fixture(expression);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'source-error/'+name,strings:true
    }).files[0];
    assert.equal(execute(result.code),execute(original),result.code);
    assert.equal(result.metrics.properties,0);
    assert.equal(result.metrics.bindings,0);
    assert.equal(result.metrics.literals,0);
  });
}

test('error constructors with primitive messages do not suppress safe property rewriting',()=>{
  const original="'use strict';const state={secretField:37};"+
    "module.exports=Error('ordinary').message+state.secretField;";
  const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'source-error-primitive',strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(original));
  assert.equal(result.metrics.properties,1);
});

test('recognizer catches nonliteral Error constructors and AggregateError messages',()=>{
  assert.equal(observesFunctionSource(parse('new Error(fn);new AggregateError([],fn);','commonjs')),true);
  assert.equal(observesFunctionSource(parse("new TypeError('plain');new AggregateError([],'plain');",'commonjs')),false);
});
