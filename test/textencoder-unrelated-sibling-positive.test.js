'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {string} */
function execute(code) {
  const context=vm.createContext({TextEncoder,module:{exports:null}});
  vm.runInContext(code,context,{timeout:2000});
  return String(context.module.exports);
}

for(const includeSibling of [false,true]) {
  test('unrelated encode method retains literal rewriting, sibling='+includeSibling,()=>{
    const nativeField=includeSibling?'native:new TextEncoder(),':'';
    const source=
      'const group={'+nativeField+'safe:{encode(value){return value;}}};'+
      'function data(){return "positive-local-source-literal";}'+
      'module.exports=group.safe.encode(data)();';
    const transformed=obfuscateFiles(
      [{path:'own.cjs',sourceType:'commonjs',code:source}],
      {mode:'coo',seed:'unrelated-encoder-sibling/'+includeSibling,
       strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(execute(String(transformed.code)),execute(source));
    assert.ok(transformed.metrics.literals>0,
      'Unrelated user .encode method must not be treated as TextEncoder source coercion');
  });
}

for(const kind of ['directMutation','aliasedMutation']) {
  test('mutable sibling receiver must keep function source bytes: '+kind,()=>{
    const change=kind==='directMutation'?
      'group.safe=new TextEncoder();':
      'const handle=group;handle.safe=new TextEncoder();';
    const source='const group={native:new TextEncoder(),'+
      'safe:{encode(value){return value;}}};'+change+
      'function observed(){return "mutation-source-sensitive-literal";}'+
      'module.exports=Array.from(group.safe.encode(observed));';
    const output=obfuscateFiles(
      [{path:'mutable.cjs',sourceType:'commonjs',code:source}],
      {mode:'coo',seed:'mutated-encoder-sibling/'+kind,
       strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(execute(String(output.code)),execute(source),
      'Inline or alias mutation makes the native encoder source observer reachable');
    assert.equal(output.metrics.literals,0);
  });
}
