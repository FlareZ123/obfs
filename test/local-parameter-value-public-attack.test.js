'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {relabelAndTamperOneFieldArithmetic}=
  require('../sims/local-param-public-tamper');

/** @param {string} code @returns {number} */
function execute(code) {
  const sandbox={module:{exports:null}};
  vm.runInNewContext(code,sandbox,{timeout:2000});
  assert.equal(typeof sandbox.module.exports,'number');
  return /** @type {number} */(sandbox.module.exports);
}

test('seedless source-only attacker relabels candidate private fields and modifies arithmetic',()=>{
  const original='function calculate(payload){const owner={secretField:payload,bias:3};'+
    'return owner.secretField+owner.bias;}module.exports=calculate(39);';
  assert.equal(execute(original),42);
  for(const mode of /** @type {const} */(['sno','coo'])) {
    for(let seed=0;seed<8;seed++) {
      const delivered=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'public-only-formal-tamper-'+seed,
        strings:false,identifiers:false,properties:true
      });
      assert.equal(delivered.files[0].metrics.objects,1);
      assert.equal(delivered.files[0].metrics.properties,2);
      assert.equal(execute(delivered.files[0].code),42);
      const publicFiles=delivered.files.map(file=>({
        path:file.path,sourceType:file.sourceType,
        code:String(file.code)
      }));
      // The attacker receives publicFiles alone. The reference source,
      // compiler, seeds, field names and metrics never enter its API.
      const attack=relabelAndTamperOneFieldArithmetic(publicFiles);
      assert.equal(attack.fields,2);
      assert.equal(execute(attack.files[0].code),42);
      assert.equal(execute(attack.tampered[0].code),36);
      assert.doesNotMatch(attack.files[0].code,/_p[0-9a-f]{12}/u);
      assert.match(attack.files[0].code,/_publicField0/u);
      assert.match(attack.files[0].code,/_publicField1/u);
    }
  }
});
