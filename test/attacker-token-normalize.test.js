'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {normalizeDistributedFiles}=require('../sims/attacker-token-normalize');

test('source-only token normalizer relabels bindings and string keys consistently',()=>{
  const file={
    path:'entry.cjs',sourceType:'commonjs',
    code:'/* _p0123456789ab is a comment */'+
      'const _v0123456789ab={"_p0123456789ab":12};'+
      'module.exports=_v0123456789ab["_p0123456789ab"];'
  };
  const result=normalizeDistributedFiles([file]);
  assert.equal(result.properties,1);
  assert.equal(result.variables,1);
  const code=result.files[0].code;
  assert.match(code,/plainField0/);
  assert.match(code,/plainLocal0/);
  assert.match(code,/\/\* _p0123456789ab is a comment \*\//);
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  assert.equal(context.module.exports,12);
});

test('independent normalizer leaves unknown identifiers and other literals alone',()=>{
  const code='const untouched={publicField:3};const s="_pNOTHEX";module.exports=[untouched.publicField,s];';
  const result=normalizeDistributedFiles([{path:'main.cjs',sourceType:'commonjs',code}]);
  assert.equal(result.files[0].code,code);
  assert.equal(result.properties,0);
  assert.equal(result.variables,0);
});
