'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * A `with` object can insert an arbitrary name into a scope at runtime,
 * including the helper name chosen only after source obfuscation. This proxy
 * models a host-controlled object without relying on a particular helper
 * name or transform seed.
 *
 * @param {string} code
 * @param {'script'|'commonjs'} type
 * @returns {string}
 */
function executeWithDynamicScope(code,type) {
  const context=vm.createContext({module:{exports:null}});
  const scope=new Proxy(Object.create(null),{
    has(_target,key) {
      return typeof key==='string' &&
        !['module','globalThis','outside'].includes(key);
    },
    get(_target,key) {
      if(key===Symbol.unscopables)return undefined;
      return ['intercepted-generated-helper'];
    }
  });
  context.opaqueScope=scope;
  vm.runInContext(code,context,{timeout:2500});
  return JSON.stringify({value:type==='script'?context.output:context.module.exports,
    outside:context.outside??null});
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  for(const sourceType of /** @type {const} */ (['commonjs','script'])) {
    const assign=sourceType==='script'?'globalThis.output':'module.exports';
    const file=sourceType==='script'?'opaque.js':'opaque.cjs';
    test(mode+' '+sourceType+' keeps literal inside opaque with environment',()=>{
      const source=
        "with(globalThis.opaqueScope){"+assign+"='with-scoped-literal';}";
      const output=obfuscateFiles([{path:file,sourceType,code:source}],{
        mode,seed:'with-scope-plain/'+mode+'/'+sourceType,
        strings:true,properties:false,identifiers:false
      }).files[0];
      assert.equal(output.metrics.literals,0,
        'A generated helper reference can be captured by the opaque with object');
      assert.equal(executeWithDynamicScope(String(output.code),sourceType),
        executeWithDynamicScope(source,sourceType));
    });

    test(mode+' '+sourceType+' still encodes literal outside with scope',()=>{
      const source=
        "globalThis.outside='outside-encoded-literal';"+
        "with(globalThis.opaqueScope){"+assign+"='inside-with-literal';}";
      const output=obfuscateFiles([{path:file,sourceType,code:source}],{
        mode,seed:'with-scope-positive/'+mode+'/'+sourceType,
        strings:true,properties:false,identifiers:false
      }).files[0];
      assert.ok(output.metrics.literals>0,
        'A preceding literal outside dynamic scope must remain transformable');
      assert.ok(!String(output.code).includes('outside-encoded-literal'));
      assert.equal(executeWithDynamicScope(String(output.code),sourceType),
        executeWithDynamicScope(source,sourceType));
    });

    test(mode+' '+sourceType+' retains nested function literal under with',()=>{
      const source="with(globalThis.opaqueScope){"+
        "globalThis.reader=()=> 'captured-with-literal';}"+
        assign+"=globalThis.reader();";
      const output=obfuscateFiles([{path:file,sourceType,code:source}],{
        mode,seed:'with-scope-closure/'+mode+'/'+sourceType,
        strings:true,properties:false,identifiers:false
      }).files[0];
      assert.equal(output.metrics.literals,0);
      assert.equal(executeWithDynamicScope(String(output.code),sourceType),
        executeWithDynamicScope(source,sourceType));
    });
  }
}
