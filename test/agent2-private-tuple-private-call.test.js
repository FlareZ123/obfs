'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

const privateSource=[
  'const owner={hiddenCount:11,privateDelta:5};',
  'const tuple=[false,"metadata",owner,null];',
  'const alias=tuple[2];',
  'function score(n){',
  '  let sum=0;',
  '  for(let i=0;i<n;i++)sum=(sum+((alias.hiddenCount+i)&255)+owner.privateDelta)|0;',
  '  return sum;',
  '}',
  'module.exports=score(operations);'
].join('\n');

const publicSource=[
  'const owner={hiddenCount:11,privateDelta:5};',
  'const tuple=[false,"metadata",owner,null];',
  'const alias=tuple[2];',
  'module.exports=function score(n){',
  '  let sum=0;',
  '  for(let i=0;i<n;i++)sum=(sum+((alias.hiddenCount+i)&255)+owner.privateDelta)|0;',
  '  return sum;',
  '};'
].join('\n');

/**
 * @param {string} source
 * @param {number} operations
 * @returns {unknown}
 */
function execute(source,operations){
  const context={module:{exports:null},operations};
  vm.runInNewContext(source,context,{timeout:5000});
  return context.module.exports;
}

/**
 * @param {string} source
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(source,mode){
  return obfuscateFiles([{
    path:'private-tuple.cjs',sourceType:'commonjs',code:source
  }],{mode,seed:'private-tuple-private-call/'+mode,
    strings:false,identifiers:false,properties:true}).files[0];
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' private direct-call tuple reader rewrites both owner fields without exporting its callable',()=>{
    const transformed=compile(privateSource,mode);
    assert.equal(transformed.metrics.properties,2,
      'The private function and tuple holder should permit both owner-field rewrites');
    assert.doesNotMatch(String(transformed.code),/hiddenCount|privateDelta/u);
    for(const operations of [0,1,100,10000]){
      assert.equal(execute(String(transformed.code),operations),
        execute(privateSource,operations),'Numeric result mismatch at '+operations);
    }
  });
}

test('public tuple score export remains source-stable and refuses owner-key rewrites',()=>{
  const transformed=compile(publicSource,'coo');
  assert.equal(transformed.metrics.properties,0,
    'An exported callable exposes its exact source through Function#toString');
  assert.equal(String(transformed.code),publicSource);
  const original=execute(publicSource,100);
  const emitted=execute(String(transformed.code),100);
  assert.equal(typeof original,'function');
  assert.equal(typeof emitted,'function');
  assert.equal(Function.prototype.toString.call(emitted),
    Function.prototype.toString.call(original));
});
