'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * The JSON.stringify builtin is mutable. Its result can be a function under
 * an ordinary host mutation, and a subsequent native btoa then exposes its
 * exact source through ToString. A source analysis must avoid treating an
 * arbitrary JSON.stringify(...) call as unconditionally primitive.
 *
 * @param {string} code
 * @returns {string}
 */
function execute(code) {
  const context=vm.createContext({module:{exports:null},btoa});
  vm.runInContext(code,context,{timeout:2500});
  return String(context.module.exports);
}

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  test(mode+' protects function source across patched JSON.stringify and btoa',()=>{
    const source="'use strict';"+
      "function secretCallable(){return 'source-byte-guard-ABC123';}"+
      "JSON.stringify=()=>secretCallable;"+
      "module.exports=btoa(JSON.stringify({value:42}));";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true);
    const emitted=obfuscateFiles([{
      path:'mutated-json.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'mutated-json-btoa-source/'+mode,
      strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(execute(String(emitted.code)),execute(source));
    assert.equal(emitted.metrics.literals,0);
  });
  test(mode+' preserves private-literal transformation with provably primitive btoa',()=>{
    const source="'use strict';"+
      "const secret='safe-primitive-output-mutation-boundary-ABC';"+
      "module.exports=btoa('fixed-text')+secret;";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
    const emitted=obfuscateFiles([{
      path:'primitive-json.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'mutated-json-btoa-positive/'+mode,
      strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(execute(String(emitted.code)),execute(source));
    assert.ok(emitted.metrics.literals>0);
  });
}
