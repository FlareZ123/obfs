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

/** @param {string} operation @returns {string} */
function fixture(operation) {
  return "'use strict';"+
    "const privateData={secretField:17};"+
    "function inspect(){const secret='sensitive-literal';return privateData.secretField+secret.length;}"+
    operation+";module.exports={value:inspect(),source:observed};";
}

for(const [name,operation] of [
  ['computed member write',"const storage={};storage[inspect]=7;const observed=Object.keys(storage)[0]"],
  ['computed member read',"const storage={[inspect]:7};const observed=Object.keys(storage)[0]"],
  ['computed literal key',"const storage={[inspect]:7};const observed=Object.keys(storage)[0]"],
  ['computed key alias',"const key=inspect;const alias=key;const storage={[alias]:7};const observed=Object.keys(storage)[0]"],
  ['in operator',"const storage={};const observed=(inspect in storage, Object.getOwnPropertyNames({[inspect]:1})[0])"],
  ['computed class method',"class Container{[inspect](){return 2;}}const observed=Object.getOwnPropertyNames(Container.prototype)[1]"],
  ['Reflect.set',"const storage={};Reflect.set(storage,inspect,7);const observed=Object.keys(storage)[0]"],
  ['Reflect.get',"const storage={[inspect]:7};Reflect.get(storage,inspect);const observed=Object.keys(storage)[0]"],
  ['Object.defineProperty',"const storage={};Object.defineProperty(storage,inspect,{value:7,enumerable:true});const observed=Object.keys(storage)[0]"],
  ['Object.getOwnPropertyDescriptor',"const storage={[inspect]:7};Object.getOwnPropertyDescriptor(storage,inspect);const observed=Object.keys(storage)[0]"]
]) {
  test('function source as property key: '+name,()=>{
    const source=fixture(operation);
    const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'source-key/'+name,strings:true
    }).files[0];
    assert.equal(execute(output.code),execute(source),output.code);
    assert.equal(output.metrics.properties,0);
    assert.equal(output.metrics.bindings,0);
    assert.equal(output.metrics.literals,0);
  });
}

test('non-function computed keys still permit safe renaming',()=>{
  const source="'use strict';const privateData={secretField:7};"+
    "const key='stable';const storage={[key]:3};"+
    "module.exports=privateData.secretField+storage[key];";
  const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'source-key-safe',strings:false
  }).files[0];
  assert.equal(execute(output.code),execute(source));
  assert.equal(output.metrics.properties,1);
});

test('Map object identity keys do not coerce function to source text',()=>{
  const source="'use strict';const privateData={secretField:7};"+
    "function inspect(){return privateData.secretField;}"+
    "const storage=new Map([[inspect,3]]);module.exports=inspect()+storage.get(inspect);";
  const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'source-key-identity',strings:false
  }).files[0];
  assert.equal(execute(output.code),execute(source));
  assert.equal(output.metrics.properties,1);
});

test('computed source-key observer detection handles transitive function aliases',()=>{
  assert.equal(observesFunctionSource(parse('function f(){}const first=f;const second=first;const o={[second]:1};','commonjs')),true);
  assert.equal(observesFunctionSource(parse("const k='abc';const o={[k]:1};",'commonjs')),false);
});
