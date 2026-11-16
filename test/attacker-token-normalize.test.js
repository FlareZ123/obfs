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

test('alternate checker hashes normalize without reading compiler internals',()=>{
  const code='const _$0123456789abcd={other:1};module.exports=_$0123456789abcd.other;';
  const result=normalizeDistributedFiles([{path:'alt.cjs',sourceType:'commonjs',code}]);
  assert.equal(result.properties,1);
  assert.match(result.files[0].code,/plainField0/);
  const context={module:{exports:null}};
  vm.runInNewContext(result.files[0].code,context,{timeout:2000});
  assert.equal(context.module.exports,1);
});

test('hashed spellings used as unrelated payload data must survive static normalization',()=>{
  const source='const record={"_p0123456789ab":12};'+
    'module.exports=[record["_p0123456789ab"],"_p0123456789ab"];';
  const original={module:{exports:null}};
  vm.runInNewContext(source,original,{timeout:2000});
  const result=normalizeDistributedFiles([
    {path:'decoy.cjs',sourceType:'commonjs',code:source}
  ]);
  assert.equal(result.properties,1,'only the real object key is a property label');
  const normalized={module:{exports:null}};
  vm.runInNewContext(result.files[0].code,normalized,{timeout:2000});
  assert.equal(JSON.stringify(normalized.module.exports),JSON.stringify(original.module.exports));
});

test('hash-shaped ordinary string data is not a recovered property',()=>{
  const source='module.exports="_p0123456789ab";';
  const result=normalizeDistributedFiles([{path:'data.cjs',sourceType:'commonjs',code:source}]);
  assert.equal(result.properties,0);
  assert.equal(result.files[0].code,source);
});
