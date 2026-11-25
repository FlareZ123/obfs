'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

const source=[
  'const owner={secretField:7};',
  'class Reader{read(){return owner.secretField;}}',
  'const reader=new Reader();',
  'module.exports=function publicReader(){return reader.read();};'
].join('\n');

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' private top-level class reader safely rewrites its owner field',()=>{
    const result=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'private-class-positive/'+mode,
      properties:true,identifiers:false,strings:false
    }).files[0];
    assert.equal(result.metrics.properties,1);
    const context={module:{exports:null}};
    vm.runInNewContext(String(result.code),context,{filename:'entry.cjs',timeout:1000});
    assert.equal(context.module.exports(),7);
  });
}
