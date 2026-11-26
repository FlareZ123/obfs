'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {unknown}
 */
function execute(code) {
  const realm={module:{exports:null}};
  vm.runInNewContext(code,realm,{timeout:2000});
  return realm.module.exports;
}

/**
 * @param {string} source
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(source) {
  return obfuscateFiles([{
    path:'private-class.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'coo',
    seed:'agent10-private-class-shadowed-owner-order',
    strings:false,
    identifiers:false,
    properties:true
  }).files[0];
}

test('nested shadowed owner cannot satisfy top-level class owner initialization order',()=>{
  const source=[
    'function decoy(){const owner={secretA:99,secretB:101};}',
    'class Reader{read(){return owner.secretA;}}',
    'const reader=new Reader();',
    'let before;',
    'try{reader.read();}catch(error){before=error.name;}',
    'const owner={secretA:7,secretB:11};',
    'module.exports=[before,reader.read(),owner.secretB];'
  ].join('');
  const transformed=compile(source);
  assert.equal(transformed.metrics.properties,0,
    'A nested same-name object must not satisfy the top-level owner-before-class gate');
  assert.equal(JSON.stringify(execute(String(transformed.code))),JSON.stringify(execute(source)));
  assert.equal(execute(source)[0],'ReferenceError');
});

test('direct eval source observation disables private class method proof',()=>{
  const source='const owner={secretA:7,secretB:11};'+
    'class Reader{read(){return owner.secretA;}}'+
    'const reader=new Reader();'+
    'eval("module.exports=[reader.read(),Reader.prototype.read.toString()]");';
  const transformed=compile(source);
  assert.equal(transformed.metrics.properties,0);
  assert.equal(String(transformed.code),source);
  assert.equal(JSON.stringify(execute(String(transformed.code))),JSON.stringify(execute(source)));
});

test('with dynamic scope disables private class method proof',()=>{
  const source='const owner={secretA:7,secretB:11};'+
    'class Reader{read(){return owner.secretA;}}'+
    'const reader=new Reader();'+
    'with({}){module.exports=reader.read();}';
  const transformed=compile(source);
  assert.equal(transformed.metrics.properties,0);
  assert.equal(String(transformed.code),source);
  assert.equal(JSON.stringify(execute(String(transformed.code))),JSON.stringify(execute(source)));
});
