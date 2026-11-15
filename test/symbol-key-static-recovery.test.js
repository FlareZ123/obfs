'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {recoverSymbolKeys}=require('../sims/symbol-key-static-recover');

/** @param {string} code @returns {number[]} */
function sample(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  const calc=/** @type {(n:number)=>number} */ (context.module.exports);
  return [calc(2),calc(4),calc(-3),calc(100)];
}

test('seedless public-output attacker removes every Symbol key in generated example',async()=>{
  const before=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/before.cjs'),'utf8');
  const after=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/after.cjs'),'utf8');
  const reconstructed=recoverSymbolKeys(after,'commonjs');
  assert.equal(reconstructed.keys,2);
  assert.doesNotMatch(reconstructed.code,/Symbol\(\)/u);
  assert.deepEqual(sample(reconstructed.code),sample(before));
});

test('attacker also recovers private property accesses after ordinary identifier pass',()=>{
  const source='const bag={privateFlag:7,gate:2};function f(x){bag.privateFlag+=x;return bag.privateFlag^bag.gate;}module.exports=f;';
  const output=obfuscateFiles([{path:'entry.cjs',code:source,sourceType:'commonjs'}],{
    mode:'sno',seed:'seed-unknown-to-attacker',strings:true,experimentalSymbolKeys:true
  });
  assert.equal(output.files[0].metrics.symbolKeys,2);
  const publicCode=/** @type {string} */ (output.files[0].code);
  const recovered=recoverSymbolKeys(publicCode,'commonjs');
  assert.equal(recovered.keys,2);
  assert.deepEqual(sample(recovered.code),sample(source));
});
