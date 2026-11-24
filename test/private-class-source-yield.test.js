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
  return Number(context.module.exports);
}

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
  test(mode+' private direct-use class preserves value and permits private owner rename',()=>{
    const result=obfuscateFiles([{
      path:'private-class.cjs',sourceType:'commonjs',code:source
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


for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
  test(mode+' private class method proof refuses class, instance, method, and optional-call escapes',()=>{
    const unsafe=[
      source.replace('module.exports=reader.read();','module.exports=reader;'),
      source.replace('module.exports=reader.read();','module.exports=Reader;'),
      source.replace('module.exports=reader.read();','const method=reader.read;module.exports=method;'),
      source.replace('module.exports=reader.read();','module.exports=reader.read?.();'),
      source.replace('module.exports=reader.read();','module.exports=reader.read.toString();')
    ];
    for(const [index,code] of unsafe.entries()){
      const result=obfuscateFiles([{
        path:'private-class.cjs',sourceType:'commonjs',code
      }],{mode,seed:'private-class-refusal/'+mode+'/'+index,
        properties:true,identifiers:false,strings:false});
      assert.equal(result.files[0].metrics.properties,0,
        mode+': an escaping or optional class method must not expose owner-key rewrites');
      assert.equal(result.files[0].code,code,
        mode+': unproved class method paths must retain their original source');
    }
  });
}
