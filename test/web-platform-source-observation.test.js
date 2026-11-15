'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={module:{exports:null},DOMException,URL,URLSearchParams,Headers};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} expression @returns {string} */
function fixture(expression) {
  return "'use strict';"+
    "function inspect(){const state={secretField:47};return state.secretField;}"+
    "const observed="+expression+";module.exports={observed,value:inspect()};";
}

for(const [name,expression] of [
  ['DOMException message','new DOMException(inspect).message'],
  ['DOMException name',"new DOMException('message',inspect).name"],
  ['DOMException alias','(()=>{const D=DOMException;return new D(inspect).message;})()'],
  ['DOMException global',"new globalThis.DOMException(inspect).message"],
  ['URL relative input',"new URL(inspect,'https://example.test/base').href"],
  ['URL global',"new globalThis.URL(inspect,'https://example.test/base').href"],
  ['URLSearchParams record',"new URLSearchParams({q:inspect}).get('q')"],
  ['URLSearchParams pairs',"new URLSearchParams([['q',inspect]]).get('q')"],
  ['URLSearchParams global',"new globalThis.URLSearchParams({q:inspect}).get('q')"],
  ['Headers record',"new Headers({'x-test':inspect}).get('x-test')"],
  ['Headers pair',"new Headers([['x-test',inspect]]).get('x-test')"],
  ['Headers global',"new globalThis.Headers({'x-test':inspect}).get('x-test')"]
]) {
  test('web platform constructor coerces function source: '+name,()=>{
    const original=fixture(expression);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'source-web-platform/'+name,strings:true
    }).files[0];
    assert.equal(execute(result.code),execute(original),result.code);
    assert.equal(result.metrics.objects,0);
    assert.equal(result.metrics.bindings,0);
    assert.equal(result.metrics.literals,0);
  });
}

test('web platform constructors with literal arguments retain own-key renaming',()=>{
  const original="'use strict';const state={secretField:47};"+
    "const param=new URLSearchParams({q:'literal'});module.exports=param.get('q')+state.secretField;";
  const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'web-platform-primitive',strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(original));
  assert.equal(result.metrics.objects,1);
});

test('AST source-observer guard recognizes web platform string conversion',()=>{
  assert.equal(observesFunctionSource(parse("new DOMException(fn);new URL(fn,'https://example.test');",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("new URLSearchParams({q:fn});new Headers([['x',fn]]);",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("new DOMException('ordinary');new URL('relative','https://example.test');",'commonjs')),false);
});
