'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const functionText='function inspect(){const state={secretField:71};return state.secretField;}';

/** @param {string} expression @returns {string} */
function fixture(expression) {
  return "'use strict';"+functionText+
    'const observed='+expression+';module.exports={observed,value:inspect()};';
}

/** @param {string} source @returns {string} */
function execute(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

for(const [name,expression] of [
  ['Collator compare', 'new Intl.Collator("en").compare(inspect,'+JSON.stringify(functionText)+')'],
  ['Collator alias', '(()=>{const collator=new Intl.Collator("en");const other=collator;return other.compare(inspect,'+JSON.stringify(functionText)+');})()'],
  ['Collator global', 'new globalThis.Intl.Collator("en").compare(inspect,'+JSON.stringify(functionText)+')'],
  ['Segmenter segment', '[...new Intl.Segmenter("en").segment(inspect)].map(x=>x.segment).join("")'],
  ['Segmenter alias', '(()=>{const segmenter=new Intl.Segmenter("en");const another=segmenter;return [...another.segment(inspect)].map(x=>x.segment).join("");})()'],
  ['ListFormat error message', '(()=>{try{new Intl.ListFormat("en").format([inspect]);return "ok";}catch(error){return error.message;}})()'],
  ['ListFormat formatToParts error', '(()=>{try{new Intl.ListFormat("en").formatToParts([inspect]);return "ok";}catch(error){return error.message;}})()']
]) {
  test('Intl source coercion remains byte-identical: '+name,()=>{
    const original=fixture(expression);
    const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'intl-source/'+name,strings:true,identifiers:true
    }).files[0];
    assert.equal(execute(output.code),execute(original),output.code);
    assert.equal(output.metrics.objects,0,output.code);
    assert.equal(output.metrics.bindings,0,output.code);
    assert.equal(output.metrics.literals,0,output.code);
  });
}

test('primitive Intl inputs preserve unrelated safe property transformations',()=>{
  const original="'use strict';const state={secretField:71};"+
    "const result=new Intl.Collator('en').compare('a','b');"+
    "const segments=[...new Intl.Segmenter('en').segment('hello')];"+
    "module.exports=state.secretField+result+segments.length;";
  const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'intl-primitive',strings:false,identifiers:false
  }).files[0];
  assert.equal(execute(output.code),execute(original),output.code);
  assert.equal(output.metrics.objects,1,output.code);
});

test('AST source observer recognizes Intl calls and keeps primitive calls eligible',()=>{
  assert.equal(observesFunctionSource(parse('function f(){};new Intl.Collator().compare(f,"x");','commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){};new Intl.Segmenter().segment(f);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){};new Intl.ListFormat().format([f]);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('new Intl.Collator().compare("a","b");','commonjs')),false);
  assert.equal(observesFunctionSource(parse('new Intl.Segmenter().segment("text");','commonjs')),false);
  assert.equal(observesFunctionSource(parse('new Intl.ListFormat().format(["a","b"]);','commonjs')),false);
});
