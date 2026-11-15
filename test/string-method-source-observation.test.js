'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const functionText='function inspect(){const state={secretField:23};return state.secretField;}';

/** @param {string} expression @returns {string} */
function fixture(expression) {
  return "'use strict';"+functionText+
    'const haystack='+JSON.stringify(functionText)+';'+
    'const observed='+expression+';module.exports={observed,value:inspect()};';
}

/** @param {string} source @returns {string} */
function execute(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

for(const [name,expression] of [
  ['includes','haystack.includes(inspect)'],
  ['startsWith','haystack.startsWith(inspect)'],
  ['endsWith','haystack.endsWith(inspect)'],
  ['indexOf','haystack.indexOf(inspect)'],
  ['lastIndexOf','haystack.lastIndexOf(inspect)'],
  ['split','haystack.split(inspect).length'],
  ['replace','haystack.replace(inspect, "changed")'],
  ['replaceAll','haystack.replaceAll(inspect, "changed")'],
  ['localeCompare','haystack.localeCompare(inspect)'],
  ['padStart','"".padStart(100,inspect)'],
  ['padEnd','"".padEnd(100,inspect)'],
  ['aliased function argument','(()=>{const alias=inspect;return haystack.includes(alias);})()'],
  ['aliased string receiver','(()=>{const text=haystack;return text.indexOf(inspect);})()']
]) {
  test('string method implicitly observes function source: '+name,()=>{
    const original=fixture(expression);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'source-string-method/'+name,strings:true
    }).files[0];
    assert.equal(execute(result.code),execute(original),result.code);
    assert.equal(result.metrics.objects,0);
    assert.equal(result.metrics.bindings,0);
    assert.equal(result.metrics.literals,0);
  });
}

test('string method with literal argument permits unrelated property rewrite',()=>{
  const original="'use strict';const o={secretField:11};const text='abcd';"+
    "module.exports=text.includes('bc') ? o.secretField : 0;";
  const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'source-string-method-positive',strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(original));
  assert.equal(result.metrics.objects,1);
});

test('AST guard detects direct string search and padding with function arguments',()=>{
  assert.equal(observesFunctionSource(parse('function f(){}; "x".includes(f);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){}; "x".padEnd(8,f);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('"x".includes("y");','commonjs')),false);
});
