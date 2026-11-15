'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {recoverObfuscatedStrings} = require('../sims/static-string-recovery');
const {neutralizeHashedNames} = require('../sims/offline-normalize');
const {atomicWrite} = require('../src/atomic');

/** @param {string} code @returns {string} */
function evaluate(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

test('static normalization removes deterministic private property spellings',()=>{
  const source=`'use strict';const item={secretField:11};const alias=item;
    module.exports=[item.secretField,alias.secretField];`;
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'name-reconstruction',strings:false
  }).files[0];
  assert.equal(output.metrics.objects,1);
  const normalized=neutralizeHashedNames([output]).files[0].code;
  assert.match(normalized,/reconstructedProperty_0/);
  assert.doesNotMatch(normalized,/_p[a-f0-9]{10}\b/);
  assert.equal(evaluate(normalized),evaluate(source));
});

test('offline XOR recovery and name normalization compose without original source',()=>{
  const source=`'use strict';const state={privateNumber:17};
    const hidden='a-recoverable-long-string';
    module.exports=[hidden,state.privateNumber];`;
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'offline-composition'
  }).files[0];
  const recovered=recoverObfuscatedStrings(output.code,'commonjs');
  assert.ok(recovered.literals>=1);
  assert.match(recovered.code,/a-recoverable-long-string/);
  const normalized=neutralizeHashedNames([{...output,code:recovered.code}]);
  assert.ok(normalized.properties>=1);
  assert.equal(evaluate(normalized.files[0].code),evaluate(source));
});

test('offline property names normalize consistently across two ESM files',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={privateNumber:23};'},
    {path:'entry.mjs',sourceType:'module',code:'import {state} from "./state.mjs";console.log(state.privateNumber);'}
  ];
  const transformed=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'cross-reconstruct'});
  assert.equal(transformed.crossFile.properties,1);
  const normalized=neutralizeHashedNames(transformed.files);
  assert.equal(normalized.properties,1);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-offline-reconstruct-'));
  try {
    /** @param {typeof files} sources @returns {Promise<string>} */
    async function run(sources) {
      for(const file of sources) await atomicWrite(path.join(dir,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{encoding:'utf8',timeout:5000});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    assert.equal(await run(normalized.files),await run(files));
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('unknown identifiers and property names remain unchanged',()=>{
  const code=`const publicName={regularField:3};module.exports=publicName.regularField;`;
  const result=neutralizeHashedNames([{path:'test.cjs',code,sourceType:'commonjs'}]);
  assert.equal(result.files[0].code,code);
  assert.equal(result.properties,0);
  assert.equal(result.variables,0);
});
