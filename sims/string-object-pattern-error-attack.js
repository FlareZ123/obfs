'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

/** @param {string} source @returns {string} */
function evaluate(source){
  /** @type {{exports:unknown}} */
  const module={exports:undefined};
  vm.runInNewContext(source,{module},{timeout:2000});
  return String(module.exports);
}

const specimens=[
  {name:'object-variable-declaration',source:[
    'const root={secretAlpha:null};let observed;',
    "try {const {value}=root['secretAlpha'];}",
    'catch(error){observed=error.message;}',
    'module.exports=observed;'
  ].join('\n')},
  {name:'object-assignment-expression',source:[
    'const root={secretAlpha:null};let observed;let value;',
    "try {({value}=root['secretAlpha']);}",
    'catch(error){observed=error.message;}',
    'module.exports=observed;'
  ].join('\n')},
  {name:'nested-array-default-object-pattern',source:[
    'const root={secretAlpha:null};let observed;',
    "try {const [{value}=root['secretAlpha']]=[undefined];}",
    'catch(error){observed=error.message;}',
    'module.exports=observed;'
  ].join('\n')},
  {name:'nested-array-default-array-pattern',source:[
    'const root={secretAlpha:null};let observed;',
    "try {const [[value]=root['secretAlpha']]=[undefined];}",
    'catch(error){observed=error.message;}',
    'module.exports=observed;'
  ].join('\n')},
  {name:'nested-object-default-array-pattern',source:[
    'const root={secretAlpha:null};let observed;',
    "try {const {nested:[value]=root['secretAlpha']}={nested:undefined};}",
    'catch(error){observed=error.message;}',
    'module.exports=observed;'
  ].join('\n')},
  {name:'nested-object-default-object-pattern',source:[
    'const root={secretAlpha:null};let observed;',
    "try {const {nested:{value}=root['secretAlpha']}={nested:undefined};}",
    'catch(error){observed=error.message;}',
    'module.exports=observed;'
  ].join('\n')}
];

/**
 * Run an exact compiler differential for string literals embedded in V8
 * source-spelled failed destructuring operands.
 * @param {boolean} guarded
 * @returns {void}
 */
function run(guarded){
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    for(const specimen of specimens){
      const emitted=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:specimen.source
      }],{
        mode,seed:'string-object-pattern-'+mode,strings:true,
        properties:false,identifiers:false
      }).files[0];
      const native=evaluate(specimen.source);
      const transformed=evaluate(/** @type {string} */(emitted.code));
      assert.match(native,/root\.secretAlpha/u,
        mode+': native TypeError must expose computed member spelling');
      const result={mode,specimen:specimen.name,
        encodedLiterals:emitted.metrics.literals,native,transformed,
        parity:native===transformed};
      process.stdout.write('STRING_OBJECT_PATTERN_OPERAND '+JSON.stringify(result)+'\n');
      if(guarded){
        assert.equal(emitted.metrics.literals,0,
          'Unsafe source-spelled computed key must remain literal');
        assert.equal(transformed,native,
          'Guarded generated TypeError.message must equal native');
      }else{
        assert.equal(emitted.metrics.literals,1,
          'Counterexample must actually encode the computed key');
        assert.notEqual(transformed,native,
          'Pre-guard encoder must exhibit source-spelled TypeError mismatch');
      }
    }
    const safe="const root={secretAlpha:23};module.exports=root['secretAlpha'];";
    const positive=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:safe
    }],{
      mode,seed:'string-object-pattern-positive-'+mode,strings:true,
      properties:false,identifiers:false
    }).files[0];
    assert.equal(positive.metrics.literals,1,
      'Unrelated safe computed string should still be genuinely encoded');
    assert.equal(evaluate(/** @type {string} */(positive.code)),evaluate(safe));
  }
}

if(require.main===module)run(process.argv.includes('--expect-guarded'));
module.exports={run,specimens};
