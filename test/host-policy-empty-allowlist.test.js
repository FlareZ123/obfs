'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles,createScoHandler}=require('../src');

/** @type {import('../src/core').SourceFile[]} */
const browserSource=[
  {path:'client.js',sourceType:'script',code:'globalThis.policyValue=29;'}
];

test('explicit empty host list must refuse unlocked COO and SCO publication',()=>{
  assert.throws(()=>obfuscateFiles(browserSource,{
    mode:'coo',allowedHosts:[]
  }),/allowedHosts must be a nonempty array/);
  assert.throws(()=>createScoHandler(browserSource,{
    allowedHosts:[]
  }),/allowedHosts must be a nonempty array/);
});

test('invalid zero-length host shapes and sparse arrays fail closed',()=>{
  for(const invalid of [
    /** @type {any} */ ({length:0}),
    /** @type {any} */ (''),
    new Array(1)
  ]) {
    assert.throws(()=>obfuscateFiles(browserSource,{
      mode:'coo',allowedHosts:invalid
    }),/allowedHosts must be a nonempty array|allowedHosts must contain strings/,
    'Invalid or sparse host-list configuration was silently unlocked');
  }
});

test('SNO rejects an explicitly supplied empty browser host policy',()=>{
  assert.throws(()=>obfuscateFiles([
    {path:'server.cjs',sourceType:'commonjs',code:'module.exports=29;'}
  ],{mode:'sno',allowedHosts:[]}),/Browser host locking does not apply to SNO/);
});

test('omitted host list intentionally keeps the backward-compatible unlocked mode',()=>{
  const output=obfuscateFiles(browserSource,{
    mode:'coo',seed:'host-policy-unlocked-explicit-omission',
    strings:false,properties:false,identifiers:false
  });
  const context={};
  vm.runInNewContext(String(output.files[0].code),context,{timeout:1000});
  assert.equal(/** @type {{policyValue?:number}} */ (context).policyValue,29);
  assert.equal(typeof createScoHandler(browserSource),'function');
});
