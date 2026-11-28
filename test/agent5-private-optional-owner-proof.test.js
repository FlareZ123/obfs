'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

/** @typedef {'coo'|'sno'|'sco'} Mode */

/** @param {string} source @returns {string} */
function execute(source){
  const module={exports:/** @type {unknown} */(null)};
  vm.runInNewContext(source,{module},{timeout:1000});
  return JSON.stringify(module.exports);
}

/** @type {Array<[string,string,number]>} */
const privateCases=[
  ['direct optional owner',
    'const owner={privateCount:11};module.exports=owner?.privateCount;',1],
  ['aliased optional owner',
    'const owner={privateCount:11};const alias=owner;module.exports=alias?.privateCount;',1],
  ['computed optional owner',
    'const owner={privateCount:11};const alias=owner;module.exports=alias?.["privateCount"];',1],
  ['interprocedural optional owner',
    'const owner={privateCount:11};function read(o){return o?.privateCount;}module.exports=read(owner);',1],
  ['null-check optional owner',
    'const owner={privateCount:11};const maybe=null;module.exports=[owner?.privateCount,maybe?.privateCount];',1],
  ['nullish owner selection',
    'const owner={privateCount:11};const alias=owner??null;module.exports=alias?.privateCount;',1]
];

test('proven private optional-chain owners preserve outputs with private rename yield',()=>{
  for(const [label,source,minYield] of privateCases){
    const original=execute(source);
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const out=obfuscateFiles([{path:'private-owner.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'agent5-optional-owner/'+label+'/'+mode,
        properties:true,identifiers:false,strings:false
      }).files[0];
      assert.equal(execute(String(out.code)),original,label+' '+mode+' semantic parity');
      console.log('OPTIONAL_PRIVATE_OWNER '+JSON.stringify({
        label,mode,properties:out.metrics.properties,code:out.code
      }));
      assert.ok(out.metrics.properties>=minYield,
        label+'/'+mode+' must keep at least one private own property protected');
    }
  }
});

test('optional access followed by public owner reflection refuses renaming',()=>{
  const source='const owner={privateCount:11};'+
    'module.exports=[owner?.privateCount,Object.keys(owner)];';
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=obfuscateFiles([{path:'negative.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'agent5-optional-owner-reflect/'+mode,
      properties:true,identifiers:false,strings:false
    }).files[0];
    assert.equal(execute(String(out.code)),execute(source));
    assert.equal(out.metrics.properties,0);
  }
});
