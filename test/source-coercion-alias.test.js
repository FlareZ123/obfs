'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {unknown}
 */
function execute(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return context.module.exports;
}

/**
 * @param {string} expression
 * @returns {string}
 */
function fixture(expression) {
  return "'use strict';function inspect(){const item={secretField:17};return item.secretField;}"+
    expression+";module.exports=JSON.stringify({value:inspect(),source:coerced});";
}

for(const [name,expression] of [
  ['direct string prefix alias',"const prefix='';const coerced=prefix+inspect"],
  ['transitive string aliases',"const first='';const prefix=first;const coerced=prefix+inspect"],
  ['assigned prefix',"let prefix;prefix='';const coerced=prefix+inspect"],
  ['String constructor alias',"const ToText=String;const coerced=ToText(inspect)"],
  ['transitive String constructor alias',"const ToText=String;const Alias=ToText;const coerced=Alias(inspect)"],
  ['globalThis.String alias',"const Root=globalThis;const ToText=Root.String;const coerced=ToText(inspect)"],
  ['destructured global String',"const {String:ToText}=globalThis;const coerced=ToText(inspect)"],
  ['String.call through alias',"const ToText=String;const coerced=ToText.call(null,inspect)"],
  ['String.apply through alias',"const ToText=String;const coerced=ToText.apply(null,[inspect])"],
  ['prefix from aliased String call',"const ToText=String;const prefix=ToText('');const coerced=prefix+inspect"]
]) {
  test('source introspection via '+name+' preserves function text',()=>{
    const source=fixture(expression);
    const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'source-coercion-alias/'+name,strings:false
    }).files[0];
    assert.equal(execute(output.code),execute(source),output.code);
    assert.equal(output.metrics.objects,0,'Observed function body must not be renamed');
    assert.equal(output.metrics.bindings,0,'Observed source must keep lexical spelling');
  });
}

test('string coercion in another supplied file also protects function source',()=>{
  const files=[
    {path:'entry.cjs',sourceType:'commonjs',
      code:"function inspect(){const item={secretField:17};return item.secretField;}module.exports=inspect;"},
    {path:'observer.cjs',sourceType:'commonjs',
      code:"const prefix='';module.exports=prefix+require('./entry.cjs');"}
  ];
  const output=obfuscateFiles(files,{mode:'sno',seed:'cross-source-coercion',strings:false});
  assert.equal(output.files[0].code,files[0].code);
  assert.equal(output.files[1].code,files[1].code);
});

test('purely numeric plus expressions leave unrelated property rewriting enabled',()=>{
  const source="'use strict';const number=4;const owned={secretField:7};module.exports=owned.secretField+number;";
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'source-coercion-numeric-positive',strings:false
  }).files[0];
  assert.equal(execute(output.code),execute(source));
  assert.equal(output.metrics.objects,1,'Numeric additions do not observe function text');
});
