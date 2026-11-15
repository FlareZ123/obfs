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

/** @param {string} body @returns {string} */
function fixture(body) {
  return "'use strict';function inspect(){const data={secretField:33};return data.secretField;}"+
    body+";module.exports={source:Object.keys(result)[0],value:inspect()};";
}

for(const [name,body] of [
  ['direct nested entry array','const result=Object.fromEntries([[inspect,1]])'],
  ['aliased entry list','const entries=[[inspect,1]];const copy=entries;const result=Object.fromEntries(copy)'],
  ['direct Map iterable','const result=Object.fromEntries(new Map([[inspect,1]]))'],
  ['Map variable iterable','const map=new Map([[inspect,1]]);const result=Object.fromEntries(map)'],
  ['function member entry',"const lib={inspect};const result=Object.fromEntries([[lib.inspect,1]])"],
  ['destructured entry function',"const lib={inspect};const {inspect:key}=lib;const result=Object.fromEntries([[key,1]])"]
]) {
  test('Object.fromEntries coerces a function key to its source: '+name,()=>{
    const original=fixture(body);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'source-from-entries/'+name,strings:true
    }).files[0];
    assert.equal(execute(result.code),execute(original),result.code);
    assert.equal(result.metrics.objects,0);
    assert.equal(result.metrics.bindings,0);
    assert.equal(result.metrics.literals,0);
  });
}

test('Map itself preserves function identity as key without source coercion',()=>{
  const original="'use strict';function inspect(){const state={secretField:31};return state.secretField;}"+
    "const map=new Map([[inspect,1]]);module.exports=map.get(inspect)+inspect();";
  const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'source-map-key-identity',strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(original));
  assert.equal(result.metrics.objects,1);
});

test('Object.fromEntries with primitive keys keeps unrelated safe own-key rename',()=>{
  const original="'use strict';const state={secretField:31};"+
    "const result=Object.fromEntries([['stable',1]]);module.exports=result.stable+state.secretField;";
  const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'source-from-entries-primitive',strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(original));
  assert.equal(result.metrics.objects,1);
});

test('AST observer follows function-key pairs through Object.fromEntries',()=>{
  assert.equal(observesFunctionSource(parse('function f(){};Object.fromEntries([[f,1]]);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){};new Map([[f,1]]);','commonjs')),false);
  assert.equal(observesFunctionSource(parse("Object.fromEntries([['literal',1]]);",'commonjs')),false);
});
