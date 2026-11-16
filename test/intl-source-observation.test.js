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
  ['Collator bound accessor', '(()=>{const compare=new Intl.Collator("en").compare;return compare(inspect,'+JSON.stringify(functionText)+');})()'],
  ['Collator namespace alias', '(()=>{const namespace=globalThis.Intl;const col=new namespace.Collator("en");return col.compare(inspect,'+JSON.stringify(functionText)+');})()'],
  ['Collator destructured constructor', '(()=>{const {Collator:Class}=Intl;return new Class("en").compare(inspect,'+JSON.stringify(functionText)+');})()'],
  ['Collator without new', 'Intl.Collator("en").compare(inspect,'+JSON.stringify(functionText)+')'],
  ['Segmenter segment', '[...new Intl.Segmenter("en").segment(inspect)].map(x=>x.segment).join("")'],
  ['Segmenter alias', '(()=>{const segmenter=new Intl.Segmenter("en");const another=segmenter;return [...another.segment(inspect)].map(x=>x.segment).join("");})()'],
  ['ListFormat error message', '(()=>{try{new Intl.ListFormat("en").format([inspect]);return "ok";}catch(error){return error.message;}})()'],
  ['ListFormat receiver alias', '(()=>{const list=new Intl.ListFormat("en");const other=list;try{return other.format([inspect]);}catch(error){return error.message;}})()'],
  ['Segmenter destructured constructor', '(()=>{const {Segmenter:Class}=globalThis.Intl;return [...new Class("en").segment(inspect)].map(x=>x.segment).join("");})()'],
  ['supportedValuesOf key', '(()=>{try{return Intl.supportedValuesOf(inspect).length;}catch(error){return error.message;}})()'],
  ['supportedValuesOf namespace alias', '(()=>{const namespace=globalThis.Intl;try{return namespace.supportedValuesOf(inspect).length;}catch(error){return error.message;}})()'],
  ['getCanonicalLocales iterable element', '(()=>{try{return Intl.getCanonicalLocales([inspect]).join(",");}catch(error){return error.message;}})()'],
  ['Locale constructor', '(()=>{try{return new Intl.Locale(inspect).toString();}catch(error){return error.message;}})()'],
  ['DisplayNames of', '(()=>{try{return new Intl.DisplayNames("en",{type:"language",fallback:"code"}).of(inspect);}catch(error){return error.message;}})()'],
  ['RelativeTimeFormat unit', '(()=>{try{return new Intl.RelativeTimeFormat("en").format(2,inspect);}catch(error){return error.message;}})()'],
  ['RelativeTimeFormat formatToParts', '(()=>{try{return new Intl.RelativeTimeFormat("en").formatToParts(2,inspect);}catch(error){return error.message;}})()'],
  ['RelativeTimeFormat receiver alias', '(()=>{const a=new Intl.RelativeTimeFormat("en");const b=a;try{return b.format(2,inspect);}catch(error){return error.message;}})()'],
  ['DateTimeFormat option timeZone', '(()=>{try{return new Intl.DateTimeFormat("en",{timeZone:inspect}).format(0);}catch(error){return error.message;}})()'],
  ['NumberFormat option currency', '(()=>{try{return new Intl.NumberFormat("en",{style:"currency",currency:inspect}).format(2);}catch(error){return error.message;}})()'],
  ['DateTimeFormat option calendar', '(()=>{try{return new Intl.DateTimeFormat("en",{calendar:inspect}).format(0);}catch(error){return error.message;}})()'],
  ['DateTimeFormat option numberingSystem', '(()=>{try{return new Intl.DateTimeFormat("en",{numberingSystem:inspect}).format(0);}catch(error){return error.message;}})()'],
  ['PluralRules option type', '(()=>{try{return new Intl.PluralRules("en",{type:inspect}).select(2);}catch(error){return error.message;}})()'],
  ['supportedValuesOf aliased function', '(()=>{const values=Intl.supportedValuesOf;return (()=>{try{return values(inspect).length;}catch(error){return error.message;}})();})()'],
  ['supportedValuesOf destructured function', '(()=>{const {supportedValuesOf:values}=Intl;try{return values(inspect).length;}catch(error){return error.message;}})()'],
  ['Intl namespace via global destructuring', '(()=>{const {Intl:namespace}=globalThis;try{return namespace.supportedValuesOf(inspect).length;}catch(error){return error.message;}})()'],
  ['NumberFormat option unit', '(()=>{try{return new Intl.NumberFormat("en",{style:"unit",unit:inspect}).format(2);}catch(error){return error.message;}})()'],
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
    "const intlStatic=Intl.supportedValuesOf('unit').length;"+
    "const rel=new Intl.RelativeTimeFormat('en').format(2,'day');"+
    "const zone=new Intl.DateTimeFormat('en',{timeZone:'UTC'}).format(0);"+
    "const display=new Intl.DisplayNames('en',{type:'language'}).of('fr');"+
    "module.exports=state.secretField+result+segments.length+intlStatic+rel.length+zone.length+display.length;";
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
  assert.equal(observesFunctionSource(parse('function f(){};Intl.supportedValuesOf(f);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){};new Intl.Locale(f);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){};new Intl.RelativeTimeFormat().format(2,f);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){};new Intl.DateTimeFormat("en",{timeZone:f});','commonjs')),true);
  assert.equal(observesFunctionSource(parse('new Intl.DateTimeFormat("en",{timeZone:"UTC"});','commonjs')),false);
  assert.equal(observesFunctionSource(parse('Intl.supportedValuesOf("unit");','commonjs')),false);
  assert.equal(observesFunctionSource(parse('function f(){};const fn=Intl.supportedValuesOf;fn(f);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){};const {Intl:Lib}=globalThis;Lib.supportedValuesOf(f);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){};new Intl.PluralRules("en",{type:f});','commonjs')),true);
  assert.equal(observesFunctionSource(parse('new Intl.PluralRules("en",{type:"cardinal"});','commonjs')),false);
});
