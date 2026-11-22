'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const test=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * Class declaration and all instances are local. Only the computed numeric
 * primitive escapes. No source-observer or opaque callback receives the class.
 * Under a source-sensitive strict export policy this owner should still
 * remain transformable.
 */
const source=[
  "'use strict';",
  'const owner={privateField:7};',
  'class Reader{read(){return owner.privateField;}}',
  'const reader=new Reader();',
  'module.exports=reader.read();'
].join('');

/**
 * @param {string} code
 * @returns {number}
 */
function evaluate(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'private-class.cjs',timeout:2000});
  return /** @type {number} */ (context.module.exports);
}

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
  test(mode+' private direct-use class preserves value and permits private owner rename',()=>{
    const result=obfuscateFiles([{
      path:'private-class.cjs',sourceType:'commonjs',code
        :source
    }],{mode,seed:'private-class-source-yield/'+mode,
      properties:true,identifiers:false,strings:false});
    const emitted=result.files[0];
    assert.equal(evaluate(source),7);
    assert.equal(evaluate(/** @type {string} */ (emitted.code)),7);
    assert.ok(emitted.metrics.properties>0,
      'A fully private direct-use class should not suppress every owner-key rewrite: '+
      emitted.code);
  });
}
