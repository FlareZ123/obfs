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
  'class Reader{read(){return owner.helper()+owner.secretField;}}',
  'const reader=new Reader();',
  'module.exports=reader.read();'
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
    assert.equal(output.metrics.properties,0,
      mode+': a function-valued owner property with this-based access is not proven safe');
    assert.equal(run(String(output.code)),native,
      mode+': this-based property access must preserve behavior');
  });
}
