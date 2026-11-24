'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const test=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {any}
 */
function evaluate(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'returned-instance.cjs',timeout:2000});
  return context.module.exports;
}

const cases=[
  {
    label:'method returns its instance',
    source:[
      'const owner={privateField:7};',
      'class Reader{read(){const value=owner.privateField;return this;}}',
      'const reader=new Reader();',
      'module.exports=reader.read();'
    ].join(''),
    observe(value){return value.read.toString();},
    value(value){return value.read()===value;}
  },
  {
    label:'method returns an escaping closure',
    source:[
      'const owner={privateField:7};',
      'class Reader{read(){return ()=>owner.privateField;}}',
      'const reader=new Reader();',
      'module.exports=reader.read();'
    ].join(''),
    observe(value){return value.toString();},
    value(value){return value();}
  }
];

for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])){
  for(const shape of cases){
    test(mode+' '+shape.label+' must not leak a renamed property through the returned value',()=>{
      const native=evaluate(shape.source);
      const transformed=obfuscateFiles([{
        path:'returned-instance.cjs',sourceType:'commonjs',code:shape.source
      }],{
        mode,seed:'private-class-returned-value/'+mode+'/'+shape.label,
        properties:true,identifiers:false,strings:false
      });
      const output=transformed.files.find(file=>file.path==='returned-instance.cjs');
      assert.ok(output,'module must remain present in '+mode);
      assert.equal(output.metrics.properties,0,
        mode+'/'+shape.label+': returned instance/function makes method source observable');
      const emitted=evaluate(String(output.code));
      assert.equal(shape.value(emitted),shape.value(native),
        mode+'/'+shape.label+': returned value behavior parity');
      assert.equal(shape.observe(emitted),shape.observe(native),
        mode+'/'+shape.label+': external Function#toString must remain byte-identical');
    });
  }
}
