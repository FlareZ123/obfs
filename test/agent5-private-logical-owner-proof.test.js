'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {string} */
function run(source){
  const module={exports:/** @type {unknown} */(null)};
  vm.runInNewContext(source,{module},{timeout:1000});
  return JSON.stringify(module.exports);
}

/**
 * Use a real function-free, unescaped private owner as the only object whose
 * fields can safely be rewritten. A proven owner is non-null and truthy, so
 * ?? and || cannot evaluate the fallback in JavaScript.
 * @type {Array<[string,string]>}
 */
const positives=[
  ['nullish owner selection',
    'const owner={privateCount:17};const alias=owner??null;module.exports=alias.privateCount;'],
  ['truthy owner selection',
    'const owner={privateCount:17};const alias=owner||null;module.exports=alias.privateCount;'],
  ['nullish optional read',
    'const owner={privateCount:17};const alias=owner??null;module.exports=alias?.privateCount;'],
  ['opaque right-hand branch never executes',
    'const owner={privateCount:17};const alias=owner??(function(){throw Error("never");})();'+
    'module.exports=alias.privateCount;']
];

for(const [label,source] of positives) {
  test('proven private logical owner gains an actual property rewrite: '+label,()=>{
    const native=run(source);
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const result=obfuscateFiles([{path:'owner.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'agent5-logical/'+label+'/'+mode,
        strings:false,identifiers:false
      }).files[0];
      assert.equal(run(String(result.code)),native,label+' '+mode+' output');
      assert.ok(result.metrics.properties>=1,label+' '+mode+' must protect a private field');
      assert.ok(!String(result.code).includes('privateCount'),
        label+' '+mode+' must not retain the owner field spelling');
    }
  });
}

/** @type {Array<[string,string]>} */
const negatives=[
  ['reflection after nullish alias',
    'const owner={privateCount:17};const alias=owner??null;module.exports=Object.keys(alias);'],
  ['reflection after truthy alias',
    'const owner={privateCount:17};const alias=owner||null;'+
    'module.exports=[alias.privateCount,Object.keys(alias)];'],
  ['unknown logical and right-hand null result',
    'const owner={privateCount:17};const alias=owner&&null;module.exports=[alias,owner.privateCount];'],
  ['owner escaped to host through logical alias',
    'const owner={privateCount:17};const alias=owner??null;globalThis.__leak=alias;'+
    'module.exports=Object.keys(alias);']
];

for(const [label,source] of negatives) {
  test('unproved logical owner and reflective escape do not permit rewriting: '+label,()=>{
    const native=run(source);
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const output=obfuscateFiles([{path:'refuse.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'agent5-logical-negative/'+label+'/'+mode,
        strings:false,identifiers:false
      }).files[0];
      assert.equal(run(String(output.code)),native,label+' '+mode+' output');
      assert.equal(output.metrics.properties,0,label+' '+mode+' must refuse unsafe key rewrite');
    }
  });
}
