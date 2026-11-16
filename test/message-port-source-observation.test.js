'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={module:{exports:null},require};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} payload @returns {string} */
function fixture(payload) {
  return "'use strict';const hidden={secretField:17};"+
    "function inspect(){const embedded='opaque-literal';return hidden.secretField+embedded.length;}"+
    "let observed;const {MessageChannel}=require('node:worker_threads');"+
    "const {port1,port2}=new MessageChannel();"+
    "try{port1.postMessage("+payload+");observed='ok';}catch(error){observed=error.message}"+
    "finally{port1.close();port2.close();}"+
    "module.exports={value:inspect(),observed};";
}

test('Node MessagePort.postMessage DataCloneError preserves original function spelling',()=>{
  const source=fixture('inspect');
  const original=execute(source);
  assert.match(original,/function inspect\(\)/);
  const result=obfuscateFiles([{
    path:'case.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed:'message-port-source',strings:true}).files[0];
  assert.equal(execute(result.code),original);
  assert.equal(result.metrics.properties,0);
  assert.equal(result.metrics.bindings,0);
  assert.equal(result.metrics.literals,0);
});

test('Node MessagePort.postMessage primitive does not disable private-key coverage',()=>{
  const source=fixture('19');
  const result=obfuscateFiles([{
    path:'case.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed:'message-port-primitive',strings:false}).files[0];
  assert.equal(execute(result.code),execute(source));
  assert.equal(result.metrics.properties,1);
});

test('postMessage source-observer preflight differentiates primitive input',()=>{
  assert.equal(observesFunctionSource(parse('port1.postMessage(inspect);','commonjs')),true);
  assert.equal(observesFunctionSource(parse('port1.postMessage(19);','commonjs')),false);
});
