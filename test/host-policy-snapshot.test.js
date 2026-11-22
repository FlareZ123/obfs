'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @type {import('../src/core').SourceFile[]} */
const source=[{
  path:'client.js',sourceType:'script',code:'globalThis.snapshotValue=37;'
}];

test('COO reads caller-supplied allowedHosts policy exactly once',()=>{
  let reads=0;
  const options={
    mode:/** @type {const} */ ('coo'),
    seed:'host-policy-caller-snapshot',
    strings:false,properties:false,identifiers:false,
    get allowedHosts() {
      reads++;
      return reads===1?['127.1']:undefined;
    }
  };
  const output=obfuscateFiles(source,options);
  assert.equal(reads,1,'caller configuration getter must be snapshotted');
  const code=String(output.files[0].code);
  const allowed={location:{hostname:'127.0.0.1'}};
  vm.runInNewContext(code,allowed,{timeout:1000});
  assert.equal(/** @type {{snapshotValue?:number}} */ (allowed).snapshotValue,37);
  const denied={location:{hostname:'127.0.0.2'}};
  assert.throws(()=>vm.runInNewContext(code,denied,{timeout:1000}),
    /Unauthorized execution host/);
});

test('SNO snapshots the hostname option before policy rejection',()=>{
  let reads=0;
  const options={
    mode:/** @type {const} */ ('sno'),
    get allowedHosts() {
      reads++;
      return reads===1?['127.1']:undefined;
    }
  };
  assert.throws(()=>obfuscateFiles([
    {path:'server.cjs',sourceType:'commonjs',code:'module.exports=42;'}
  ],options),/Browser host locking does not apply to SNO/);
  assert.equal(reads,1,'SNO policy getter must not be called again');
});
