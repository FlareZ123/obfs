'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * The inert nested helper is never invoked or exported. Its unresolved
 * callback reference cannot expose the enclosing caller at runtime.
 * A conservative source-observer proof must avoid traversing a dead nested
 * function as if its body runs synchronously with the enclosing function.
 * @param {string} source
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {{value:number,properties:number,source:string}}
 */
function compileAndRun(source,mode) {
  const result=obfuscateFiles([{path:'nested.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'nested-source-inert-callback/'+mode,
    properties:true,strings:false,identifiers:false
  });
  const code=/** @type {string} */(result.files[0].code);
  const module={exports:0};
  vm.runInNewContext(code,{module},{timeout:3000});
  return {value:/** @type {number} */(module.exports),
    properties:result.files[0].metrics.properties,source:code};
}

const cases=[
  ['unreachable nested declaration',
   'const owner={privateSecret:31};'+
   'function readPrivate(){function unused(){hostCallback();}'+
   'return owner.privateSecret;}module.exports=readPrivate();'],
  ['inert nested closure stored locally',
   'const owner={privateSecret:31};'+
   'function readPrivate(){const unused=()=>hostCallback();'+
   'return owner.privateSecret;}module.exports=readPrivate();'],
  ['unreachable guarded nested helper',
   'const owner={privateSecret:31};'+
   'function readPrivate(){if(false){const unused=()=>hostCallback();}'+
   'return owner.privateSecret;}module.exports=readPrivate();']
];
for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  for(const [name,source] of cases){
    test(mode+' dead nested host callback retains private owner yield: '+name,()=>{
      const nativeModule={exports:0};
      vm.runInNewContext(source,{module:nativeModule},{timeout:3000});
      const compiled=compileAndRun(source,mode);
      process.stdout.write('CALLSITE_DEAD_NESTED_POSITIVE '+JSON.stringify({
        mode,name,nativeValue:nativeModule.exports,
        emittedValue:compiled.value,properties:compiled.properties
      })+'\n');
      assert.equal(nativeModule.exports,31);
      assert.equal(compiled.value,nativeModule.exports);
      assert.equal(compiled.properties,1,
        'A never-invoked nested host reference cannot observe outer caller source');
    });
  }
}
