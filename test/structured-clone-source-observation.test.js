'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={module:{exports:null},structuredClone};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} expression @returns {string} */
function fixture(expression) {
  return "'use strict';const hidden={secretField:17};"+
    "function inspect(){const embedded='opaque-literal';return hidden.secretField+embedded.length;}"+
    expression+";module.exports={value:inspect(),observed};";
}

for(const [name,expression] of [
  ['direct','structuredClone(inspect)'],
  ['global member','globalThis.structuredClone(inspect)'],
  ['aliased direct','(()=>{const copy=structuredClone;return copy(inspect);})()'],
  ['aliased global member','(()=>{const Root=globalThis;const copy=Root.structuredClone;return copy(inspect);})()'],
  ['global destructuring','(()=>{const {structuredClone:copy}=globalThis;return copy(inspect);})()'],
  ['nested function','structuredClone({callback:inspect})']
]) {
  test('structuredClone function-source error: '+name,()=>{
    const source=fixture('let observed;try{'+expression+'}catch(error){observed=error.message}');
    const original=execute(source);
    assert.match(original,/function inspect\(\)/);
    const result=obfuscateFiles([{
      path:'case.cjs',sourceType:'commonjs',code:source
    }],{mode:'sno',seed:'structured-clone/'+name,strings:true}).files[0];
    assert.equal(execute(result.code),original,'Source-bearing DataCloneError must match');
    assert.equal(result.metrics.properties,0,'Source observer must protect private keys');
    assert.equal(result.metrics.bindings,0,'Source observer must protect lexical names');
    assert.equal(result.metrics.literals,0,'Source observer must protect string spellings');
  });
}

test('cross-file structuredClone source observation protects other module',()=>{
  const files=[
    {path:'original.cjs',sourceType:'commonjs',
      code:"function inspect(){const hidden={secretField:19};return hidden.secretField;}module.exports=inspect;"},
    {path:'observer.cjs',sourceType:'commonjs',
      code:"let message;try{structuredClone(require('./original.cjs'))}catch(error){message=error.message}module.exports=message;"}
  ];
  const result=obfuscateFiles(files,{mode:'sno',seed:'cross-structured-clone',strings:true});
  assert.equal(result.files[0].code,files[0].code);
  assert.equal(result.files[1].code,files[1].code);
});

test('primitive-only structuredClone preserves unrelated private-key coverage',()=>{
  const source=fixture("const observed=structuredClone('hello')");
  const result=obfuscateFiles([{
    path:'case.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed:'structured-clone-positive',strings:false}).files[0];
  assert.equal(execute(result.code),execute(source));
  assert.equal(result.metrics.properties,1);
});

test('structuredClone syntactic source-observation guard differentiates inputs',()=>{
  assert.equal(observesFunctionSource(parse('structuredClone(fn);','commonjs')),true);
  assert.equal(observesFunctionSource(parse("structuredClone('plain');",'commonjs')),false);
});
