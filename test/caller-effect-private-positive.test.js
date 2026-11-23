'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {string}
 */
function observe(code){
  const pub={};
  const sandbox={module:{exports:pub},exports:pub};
  vm.runInNewContext(code,sandbox,{timeout:3000});
  return JSON.stringify(sandbox.module.exports);
}

/** @type {[string,string,number][]} */
const positives=[
  ['two direct local owners in one private caller',[
    'function compute(){',
    'const first={firstValue:4};',
    'const second={secondValue:7};',
    'return first.firstValue+second.secondValue;',
    '}',
    'module.exports=compute();'
  ].join('\n'),2],
  ['two outer private owners in one private caller',[
    'const first={firstValue:4};',
    'const second={secondValue:7};',
    'function compute(){return first.firstValue+second.secondValue;}',
    'module.exports=compute();'
  ].join('\n'),2],
  ['immutable primitive argument admitted through a direct call',[
    'function compute(value){',
    'const owner={secretField:17};',
    'return owner.secretField+value;',
    '}',
    'module.exports=compute(3);'
  ].join('\n'),1],
  ['opaque parameter used only in typeof without coercion',[
    'function compute(value){',
    'const owner={secretField:17};',
    'return [owner.secretField,typeof value];',
    '}',
    'module.exports=compute({arbitrary:3});'
  ].join('\n'),1],
  ['private owner fields returned in an inert array',[
    'function compute(){',
    'const owner={secretField:17,bonusField:5};',
    'return [owner.secretField,owner.bonusField];',
    '}',
    'module.exports=compute();'
  ].join('\n'),2]
];

for(const [label,source,expected] of positives){
  test('conservative caller-effect proof must retain safe yield / '+label,()=>{
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode:'sno',seed:'caller-effect-private-positive/'+label,
      identifiers:false,strings:false,properties:true
    });
    const emitted=output.files[0];
    assert.equal(observe(String(emitted.code)),observe(source),
      'Semantic parity with original CommonJS arithmetic');
    assert.equal(emitted.metrics.properties,expected,
      'These private primitive owners never invoke outside code and should remain eligible');
  });
}
