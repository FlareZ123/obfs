'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {parse}=require('../src/ast');
const {provenLocalReflectGetCaptures}=require('../src/decoder-safe-reads');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {number} */
function safeCount(source) {
  return provenLocalReflectGetCaptures(parse(source,'commonjs')).size;
}

/** @param {string} code @returns {string} */
function execute(code) {
  const context=vm.createContext({module:{exports:null}});
  vm.runInContext(code,context,{timeout:2500});
  return JSON.stringify(context.module.exports);
}

for(const source of [
  "const get=Reflect.get;const number=get({known:2},'known');",
  "const get=Reflect['get'];const number=get({known:2},'known');",
  "const get=Reflect.get;const a=get({known:2},'known');const b=get({safe:3},'safe');",
  "const get=Reflect.get;function local(){return get({known:'x'},'known');}local();",
  "const get=Reflect.get;const number=get({known:null},'known');",
  "const get=Reflect.get;const number=get({known:1,other:'text'},'known');"
]) {
  test('prove bounded captured Reflect.get primitive local read: '+source.slice(0,75),()=>{
    assert.equal(safeCount(source),1);
  });
}

for(const source of [
  "const get=Reflect.get;get(globalThis,'String');",
  "const get=Reflect.get;get(Array,'prototype');",
  "const get=Reflect.get;get({known:String},'known');",
  "const get=Reflect.get;get({known:{secret:1}},'known');",
  "const get=Reflect.get;get({known:2},key);",
  "const get=Reflect.get;get({known:2},'unknown');",
  "const get=Reflect.get;get({get known(){return 2;}},'known');",
  "const get=Reflect.get;get({known:3,...{other:2}},'known');",
  "const get=Reflect.get;get({__proto__:null,known:2},'known');",
  "const get=Reflect.get;get({known:2},'known');send(get);",
  "const get=Reflect.get;get.call(Reflect,{known:2},'known');",
  "const get=Reflect.get;const f=get;f({known:2},'known');",
  "const get=Reflect.get;const f={get};f.get({known:2},'known');",
  "const {get}=Reflect;get({known:2},'known');",
  "const Reflect={get(){return 2;}};const get=Reflect.get;get({known:2},'known');",
  "const get=Reflect.get;globalThis.Reflect={get(){return 2;}};get({known:2},'known');",
  "let get;get=Reflect.get;get({known:2},'known');",
  "const get=Reflect.get;const f=function(get){return get({known:2},'known');};",
  "const get=Reflect.get;function g(){const get=()=>2;return get({known:2},'known');}"
]) {
  test('refuse escaped/unknown captured Reflect.get read: '+source.slice(0,70),()=>{
    assert.equal(safeCount(source),0);
  });
}

for(const mode of /** @type {const} */ (['sno','coo','sco'])) {
  test('safe bounded captured Reflect.get retains protected string coverage in '+mode,()=>{
    const source="const text='source-observation-literal';"+
      "const get=Reflect.get;const value=get({known:2},'known');"+
      "module.exports={text,count:value};";
    const output=obfuscateFiles([{path:'owned.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'bounded-captured-read/'+mode,strings:true,identifiers:false,
      properties:false
    }).files[0];
    assert.ok(output.metrics.literals>0,'No protected string was encoded');
    assert.ok(!String(output.code).includes('source-observation-literal'),
      'Safe detached getter should no longer suppress the protected literal');
    assert.equal(execute(String(output.code)),execute(source));
  });
  test('unsafe captured Reflect.get keeps conservative string refusal in '+mode,()=>{
    const source="const text='source-observation-literal';"+
      "const get=Reflect.get;const value=get(globalThis,'String');"+
      "module.exports={text,kind:typeof value};";
    const output=obfuscateFiles([{path:'opaque.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'opaque-captured-read/'+mode,strings:true,identifiers:false,
      properties:false
    }).files[0];
    assert.equal(output.metrics.literals,0);
    assert.equal(execute(String(output.code)),execute(source));
  });
}
