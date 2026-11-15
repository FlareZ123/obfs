'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} declaration @returns {string} */
function fixture(declaration) {
  return "'use strict';const hidden={secretField:17};"+
    "function inspect(){const embedded='opaque-literal';return hidden.secretField+embedded.length;}"+
    declaration+";module.exports={value:inspect(),source:observed};";
}

for (const [name,declaration] of [
  ['RegExp call','const observed=RegExp(inspect).source'],
  ['RegExp constructor','const observed=new RegExp(inspect).source'],
  ['RegExp alias','const Pattern=RegExp;const observed=Pattern(inspect).source'],
  ['global RegExp alias','const Root=globalThis;const Pattern=Root.RegExp;const observed=Pattern(inspect).source'],
  ['Symbol constructor','const observed=Symbol(inspect).description'],
  ['Symbol.for','const observed=Symbol.for(inspect).description'],
  ['Symbol.for through alias','const Sym=Symbol;const observed=Sym.for(inspect).description'],
  ['global Symbol.for','const Root=globalThis;const observed=Root.Symbol.for(inspect).description'],
  ['encodeURI','const observed=encodeURI(inspect)'],
  ['encodeURIComponent','const observed=encodeURIComponent(inspect)'],
  ['decodeURI','const observed=decodeURI(inspect)'],
  ['decodeURIComponent','const observed=decodeURIComponent(inspect)'],
  ['global encodeURIComponent','const Root=globalThis;const observed=Root.encodeURIComponent(inspect)'],
  ['encodeURIComponent alias','const Codec=encodeURIComponent;const observed=Codec(inspect)'],
  ['RegExp.call','const observed=RegExp.call(null,inspect).source'],
  ['Symbol.for.call','const observed=Symbol.for.call(null,inspect).description'],
  ['RegExp.apply','const observed=RegExp.apply(null,[inspect]).source']
]) {
  test('implicit builtin function source coercion: '+name,()=>{
    const source=fixture(declaration);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'source-builtin/'+name,strings:true
    }).files[0];
    assert.equal(execute(result.code),execute(source),'Differential mismatch: '+result.code);
    assert.equal(result.metrics.properties,0,'Observer must protect own property keys');
    assert.equal(result.metrics.bindings,0,'Observer must protect lexical spelling');
    assert.equal(result.metrics.literals,0,'Observer must protect string literal spelling');
  });
}

test('cross-file builtin coercion protects function source from another module',()=>{
  const files=[
    {path:'original.cjs',sourceType:'commonjs',
      code:"function inspect(){const item={secretField:19};return item.secretField;}module.exports=inspect;"},
    {path:'observer.cjs',sourceType:'commonjs',
      code:"const R=RegExp;module.exports=R(require('./original.cjs')).source;"}
  ];
  const result=obfuscateFiles(files,{mode:'sno',seed:'cross-builtin-source',strings:true});
  assert.equal(result.files[0].code,files[0].code);
  assert.equal(result.files[1].code,files[1].code);
});

test('primitive-only builtin arguments do not disable unrelated safe renaming',()=>{
  const source="'use strict';const hidden={secretField:17};"+
    "const observed=RegExp('abc').source;module.exports={value:hidden.secretField,source:observed};";
  const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'source-builtin-positive',strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(source));
  assert.equal(result.metrics.properties,1);
});

test('explicit source-observation guard recognizes standard string coercers',()=>{
  assert.equal(observesFunctionSource(parse('RegExp(fn);Symbol.for(fn);','commonjs')),true);
  assert.equal(observesFunctionSource(parse("RegExp('plain');Symbol.for('constant');",'commonjs')),false);
});
