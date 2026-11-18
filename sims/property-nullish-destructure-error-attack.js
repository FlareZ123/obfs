'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

/** @param {string} source @returns {string} */
function evaluate(source) {
  /** @type {{exports:unknown}} */
  const module={exports:undefined};
  vm.runInNewContext(source,{module},{timeout:2000});
  return String(module.exports);
}

const specimens=[
  {name:'object-variable-declaration',source:[
    'const root={secretAlpha:null};let observed="none";',
    'try {const {value}=root.secretAlpha;}',
    'catch(error){observed=error.message;}',
    'module.exports=observed;'
  ].join('\n')},
  {name:'object-assignment-expression',source:[
    'const root={secretAlpha:null};let observed="none";let value;',
    'try {({value}=root.secretAlpha);}',
    'catch(error){observed=error.message;}',
    'module.exports=observed;'
  ].join('\n')},
  {name:'object-pattern-through-logical-expression',source:[
    'const root={secretAlpha:null};let observed="none";',
    'try {const {value}=root.secretAlpha??null;}',
    'catch(error){observed=error.message;}',
    'module.exports=observed;'
  ].join('\n')}
];

/**
 * Evaluate all native/transformed differential arms on the actual compiler.
 * The pre-guard mode is a narrow, source-pinned counterexample assertion;
 * the guarded mode becomes the durable conservative semantic regression.
 * @param {boolean} guarded
 * @returns {void}
 */
function run(guarded) {
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    for(const specimen of specimens) {
      const source=specimen.source;
      const emitted=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'nullish-object-pattern-'+mode,strings:false,identifiers:false}).files[0];
      const native=evaluate(source);
      const transformed=evaluate(/** @type {string} */ (emitted.code));
      assert.match(native,/root\.secretAlpha/,
        mode+': native caught TypeError must expose the original member text');
      const observed={
        mode,specimen:specimen.name,rewrittenFields:emitted.metrics.properties,
        native,transformed,parity:native===transformed
      };
      process.stdout.write('NULLISH_PATTERN_OPERAND '+JSON.stringify(observed)+'\n');
      if(guarded) {
        assert.equal(emitted.metrics.properties,0,'Unsafe caught operand must retain its key');
        assert.equal(transformed,native,'Guarded generated error.message must be identical');
      } else {
        assert.equal(emitted.metrics.properties,1,'Counterfactual must actually rewrite the private key');
        assert.notEqual(transformed,native,'Pre-guard compiler must exhibit source-spelled TypeError mismatch');
      }
    }
    const safe='const root={secretAlpha:23};module.exports=root.secretAlpha;';
    const positive=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:safe
    }],{mode,seed:'nullish-pattern-positive-'+mode,strings:false,identifiers:false}).files[0];
    assert.equal(positive.metrics.properties,1,
      'Unrelated safe private field should still be genuinely rewritten');
    assert.equal(evaluate(/** @type {string} */ (positive.code)),evaluate(safe));
  }
}

if(require.main===module)run(process.argv.includes('--expect-guarded'));
module.exports={run};
