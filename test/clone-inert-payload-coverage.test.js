'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={require,module:{exports:null},structuredClone};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} operation @returns {string} */
function fixture(operation) {
  return "'use strict';const hidden={secretField:17};"+
    "function inspect(){const embedded='opaque-literal';return hidden.secretField+embedded.length;}"+
    operation+";module.exports={value:inspect(),observed};";
}

const benign="{label:'ok',nested:[1,,{state:true,items:['a',2,null]}]}";
for(const [name,operation] of [
  ['structuredClone object','const observed=structuredClone('+benign+')'],
  ['structuredClone array','const observed=structuredClone([1,{nested:[false]}])'],
  ['v8.serialize object','const observed=require("node:v8").serialize('+benign+').length'],
  ['MessagePort object',"const {port1,port2}=new (require('node:worker_threads').MessageChannel)();"+
    "let observed;try{port1.postMessage("+benign+");observed='ok'}finally{port1.close();port2.close()}"]
]) {
  test('inert clone data preserves unrelated private-field transformation: '+name,()=>{
    const source=fixture(operation);
    const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'clone-inert/'+name,strings:false
    }).files[0];
    assert.equal(execute(output.code),execute(source));
    assert.equal(output.metrics.properties,1,'Inert data must preserve protected-work yield');
    assert.doesNotMatch(output.code,/hidden\.secretField/);
  });
}

for(const [name,operation] of [
  ['nested function','structuredClone({nested:[{fn:inspect}]})'],
  ['getter function','structuredClone({get fn(){return inspect}})'],
  ['v8 nested function','require("node:v8").serialize({nested:[inspect]})'],
  ['MessagePort nested function',"(()=>{const {port1,port2}=new (require('node:worker_threads').MessageChannel)();"+
    "try{return port1.postMessage({callback:inspect})}finally{port1.close();port2.close()}})()"]
]) {
  test('clone payload with callable remains source observed: '+name,()=>{
    const source=fixture('let observed;try{'+operation+'}catch(error){observed=error.message}');
    const expected=execute(source);
    assert.match(expected,/function inspect\(\)/);
    const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'clone-opaque/'+name,strings:true
    }).files[0];
    assert.equal(execute(output.code),expected);
    assert.equal(output.metrics.properties,0);
    assert.equal(output.metrics.bindings,0);
    assert.equal(output.metrics.literals,0);
  });
}

test('clone static preflight discriminates inert literals and unknown nested values',()=>{
  for(const code of [
    "structuredClone({label:'ok',nested:[1,{ready:true}]});",
    "require('node:v8').serialize([1,{nested:['ok']}]);",
    "port.postMessage({type:'ping',payload:[1,null]});"
  ]) assert.equal(observesFunctionSource(parse(code,'commonjs')),false,code);
  for(const code of [
    "structuredClone({get fn(){return inspect}});",
    "structuredClone({fn:inspect});",
    "require('node:v8').serialize({nested:[inspect]});",
    "port.postMessage({payload:inspect});"
  ]) assert.equal(observesFunctionSource(parse(code,'commonjs')),true,code);
});
