'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const test=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {Function}
 */
function evaluate(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'returned-owner-function.cjs',timeout:2000});
  assert.equal(typeof context.module.exports,'function');
  return context.module.exports;
}

const cases=[
  {
    label:'function declaration stored in returned owner property',
    source:[
      'function secret(){return owner.privateField;}',
      'const owner={privateField:secret};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'module.exports=reader.read();'
    ].join('')
  },
  {
    label:'arrow function stored in returned owner property',
    source:[
      'const owner={privateField:()=>owner.privateField};',
      'class Reader{read(){return owner.privateField;}}',
      'const reader=new Reader();',
      'module.exports=reader.read();'
    ].join('')
  }
];

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
  for(const shape of cases){
    test(mode+' '+shape.label+' must not leak renamed owner key through Function#toString',()=>{
      const native=evaluate(shape.source);
      const transformed=obfuscateFiles([{
        path:'returned-owner-function.cjs',sourceType:'commonjs',code:shape.source
      }],{
        mode,seed:'private-class-returned-owner-function/'+mode+'/'+shape.label,
        properties:true,identifiers:false,strings:false
      });
      const output=transformed.files.find(file=>file.path==='returned-owner-function.cjs');
      assert.ok(output,'module must remain present in '+mode);
      assert.equal(output.metrics.properties,0,
        mode+'/'+shape.label+': a returned function makes its source observable');
      const emitted=evaluate(String(output.code));
      assert.equal(emitted(),emitted,mode+'/'+shape.label+': emitted function self-return behavior');
      assert.equal(native(),native,mode+'/'+shape.label+': native function self-return behavior');
      assert.equal(emitted.toString(),native.toString(),
        mode+'/'+shape.label+': Function#toString must remain byte-identical');
    });
  }
}
