'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} source
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(source,mode) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'private-reader-public-wrapper/'+mode,
    strings:false,identifiers:false,properties:true
  }).files[0];
}

/** @param {string} source @returns {(n:number)=>number} */
function evaluate(source) {
  const context={module:{exports: /** @type {unknown} */ (null)}};
  vm.runInNewContext(source,context,{filename:'entry.cjs',timeout:3000});
  assert.equal(typeof context.module.exports,'function');
  return /** @type {(n:number)=>number} */ (context.module.exports);
}

const publicWrapper=[
  'const owner={secretField:41};',
  'function read(input){return input.secretField;}',
  'function published(n){return read(owner)+n;}',
  'module.exports=published;'
].join('');

const exportedArrow=[
  'const owner={secretField:41};',
  'function read(input){return input.secretField;}',
  'module.exports=(n)=>read(owner)+n;'
].join('');

const sourceObserved=[
  'const owner={secretField:41};',
  'function read(input){return input.secretField;}',
  'module.exports=(n)=>read(owner)+n;',
  'module.exports.reader=read;'
].join('');

const directPublicRead=[
  'const owner={secretField:41};',
  'function published(n){return owner.secretField+n;}',
  'module.exports=published;'
].join('');

const mixedProvenance=[
  'const owner={secretField:41};',
  'function read(input){return input.secretField;}',
  'function published(input){return read(owner)+read(input);}',
  'module.exports=published;'
].join('');

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  for(const [name,source] of [
    ['named exported wrapper',publicWrapper],
    ['arrow exported wrapper',exportedArrow]
  ]) {
    test(mode+' admits private read behind '+name+' without modifying its public source',()=>{
      const prepared=compile(source,mode);
      const original=evaluate(source);
      const emitted=evaluate(String(prepared.code));
      assert.equal(prepared.metrics.properties,1,
        'One private own field should be renamed behind an unchanged public wrapper');
      assert.equal(original.toString(),emitted.toString(),
        'Public function text must retain original spelling');
      assert.doesNotMatch(String(prepared.code),/secretField/u);
      for(const value of [-100,-1,0,1,100])
        assert.equal(emitted(value),original(value));
    });
  }

  test(mode+' refuses a private reader reference escaping as a public function property',()=>{
    const transformed=compile(sourceObserved,mode);
    assert.equal(transformed.metrics.properties,0);
    assert.equal(transformed.code,sourceObserved);
  });

  test(mode+' refuses rewriting a directly source-visible field in the exported wrapper',()=>{
    const transformed=compile(directPublicRead,mode);
    assert.equal(transformed.metrics.properties,0);
    assert.equal(transformed.code,directPublicRead);
  });

  test(mode+' refuses a private reader called on both owned and unproved external values',()=>{
    const transformed=compile(mixedProvenance,mode);
    assert.equal(transformed.metrics.properties,0);
    assert.equal(transformed.code,mixedProvenance);
  });
}
