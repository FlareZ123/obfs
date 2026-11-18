'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');
const {specimens}=require('./property-nullish-destructure-error-attack');

/** @param {string} source @returns {string} */
function evaluate(source){
  /** @type {{exports:unknown}} */const module={exports:undefined};
  vm.runInNewContext(source,{module},{timeout:2000});
  return String(module.exports);
}

/** @param {boolean} guarded */
function run(guarded){
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    for(const specimen of specimens.filter(x=>x.name.startsWith('nested-'))){
      const emitted=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:specimen.source}],{
        mode,seed:'nested-id-operand-'+mode,identifiers:true,properties:false,strings:false
      }).files[0];
      const native=evaluate(specimen.source);
      const transformed=evaluate(/** @type {string} */(emitted.code));
      assert.match(native,/root\.secretAlpha/);
      const result={mode,specimen:specimen.name,renamedBindings:emitted.metrics.bindings,
        native,transformed,parity:native===transformed};
      process.stdout.write('NESTED_IDENTIFIER_OPERAND '+JSON.stringify(result)+'\n');
      if(guarded)assert.equal(transformed,native,'Nested TypeError source operand must stay unchanged');
      else assert.notEqual(transformed,native,'Counterfactual must demonstrate identifier-induced mismatch');
    }
  }
}
if(require.main===module)run(process.argv.includes('--expect-guarded'));
module.exports={run};
