'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {string} */
function run(code) {
  const sandbox={module:{exports:null}};
  vm.runInNewContext(code,sandbox,{timeout:1200});
  return JSON.stringify(sandbox.module.exports);
}

/** @type {Array<{name:string,source:string,renamed:boolean}>} */
const cases=[
  {
    name:'bound parameter shorthand __proto__ is an enumerable own data property',
    source:'function inspect(__proto__){const state={__proto__};'+
      'return [state.__proto__,Object.keys(state),'+
      'Object.getPrototypeOf(state)===Object.prototype];}'+
      'module.exports=inspect(39);',
    renamed:true
  },
  {
    name:'lexical const shorthand __proto__ retains data descriptor',
    source:'function inspect(){const __proto__=31;const state={__proto__};'+
      'const descriptor=Object.getOwnPropertyDescriptor(state,"__proto__");'+
      'return [descriptor.value,descriptor.enumerable,descriptor.writable,'+
      'descriptor.configurable,Object.getPrototypeOf(state)===Object.prototype];}'+
      'module.exports=inspect();',
    renamed:true
  },
  {
    name:'shorthand __proto__ property stays writable as own data',
    source:'function inspect(__proto__){const state={__proto__};'+
      'state.__proto__=47;return [state.__proto__,Object.keys(state)];}'+
      'module.exports=inspect(31);',
    renamed:true
  },
  {
    name:'ordinary explicit colon __proto__ remains prototype setter',
    source:'function inspect(value){const state={"__proto__":value};'+
      'return [Object.hasOwn(state,"__proto__"),Object.getPrototypeOf(state)===value];}'+
      'module.exports=inspect({flag:7});',
    renamed:false
  },
  {
    name:'computed __proto__ remains own data property',
    source:'function inspect(value){const state={["__proto__"]:value};'+
      'return [Object.hasOwn(state,"__proto__"),Object.getPrototypeOf(state)===Object.prototype];}'+
      'module.exports=inspect(39);',
    renamed:false
  }
];

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  for(const item of cases) {
    test(mode+' identifier shorthand prototype semantics: '+item.name,()=>{
      const output=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:item.source
      }],{mode,seed:'prototype-shorthand-identifier/'+item.name,
        identifiers:true,strings:false,properties:false}).files[0];
      assert.equal(run(output.code),run(item.source),output.code);
      if(item.renamed){
        assert.ok(output.metrics.bindings>=1,'Expected a genuine lexical rename');
        assert.match(output.code,/\["__proto__"\]\s*:/u,
          'A shorthand own data key must be emitted computed');
      }
    });
  }
}
