'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute a CommonJS source in an isolated realm and observe its exported value.
 * @param {string} code
 * @returns {unknown}
 */
function run(code){
  const context={module:{exports:undefined}};
  vm.runInNewContext(code,context,{timeout:1000});
  return context.module.exports;
}

const source=[
  'const owner={secretField:7,helper:function(){return this.secretField;}};',
  'module.exports=owner.helper()+owner.secretField;'
].join('\n');

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' must not rename owner fields used through a function-valued property receiver',()=>{
    const native=run(source);
    const result=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'function-valued-owner-this/'+mode,
      properties:true,identifiers:false,strings:false
    });
    const output=result.files.find(file=>file.path==='entry.cjs');
    assert.ok(output,'transformed CommonJS entry must remain present');
    const emitted=run(String(output.code));
    assert.equal(emitted,native,
      mode+': this-based property access must preserve behavior (property rewrites='+output.metrics.properties+')');
  });
}
