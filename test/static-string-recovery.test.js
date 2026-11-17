'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');
const {recoverObfuscatedStrings} = require('../sims/static-string-recovery');

/** @param {string} source @returns {string} */
function execute(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/**
 * Prove that the static recovery operates without executing the target source.
 * @param {string} source
 * @param {string[]} expectedRecovered
 */
function recover(source,expectedRecovered) {
  const obfuscated=obfuscateFiles([{path:'sample.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'static-recovery-adversarial',properties:false
  }).files[0].code;
  const result=recoverObfuscatedStrings(obfuscated,'commonjs');
  assert.equal(result.tables,1);
  assert.ok(result.literals>=expectedRecovered.length);
  for(const literal of expectedRecovered) {
    assert.ok(result.code.includes(JSON.stringify(literal)),`Did not statically recover literal: ${literal}`);
  }
  assert.equal(execute(obfuscated),execute(source));
  assert.equal(execute(result.code),execute(source));
  assert.deepEqual(result.diagnostics,[]);
}

test('public XOR key is sufficient to recover secret strings offline',()=>{
  recover(`'use strict';const password='eager-reconstructable-string-1';module.exports=password;`,
    ['eager-reconstructable-string-1']);
});

test('static recovery decodes repeated shared literals and multiple values',()=>{
  // Return the array itself: a source-observing Array#join call has
  // deliberately different proof obligations from this inert data export.
  recover(`'use strict';const values=['first-long-literal','second-long-literal',
    'first-long-literal'];module.exports=values;`,
  ['first-long-literal','second-long-literal']);
});

test('static recovery preserves supplementary and unpaired surrogate code units',()=>{
  const long='value-😀-\uD800-\uDC00-\uD800abc';
  recover(`'use strict';module.exports=${JSON.stringify(long)};`,[long]);
});

test('static recovery also works with hashbang-preserving generated programs',()=>{
  recover(`#!/usr/bin/env node\n'use strict';module.exports='hashbang-secret-text';`,['hashbang-secret-text']);
});

test('unrecognized code and helpers are left byte-for-byte unchanged',()=>{
  const code=`const _o0123456789ab=['secret-value'];console.log(_o0123456789ab[0]);`;
  const result=recoverObfuscatedStrings(code,'script');
  assert.equal(result.code,code);
  assert.equal(result.tables,0);
  assert.equal(result.literals,0);
});

test('computed table access outside the supported static proof is preserved',()=>{
  const code=`const _o0123456789ab=['encoded-data'];for(let i=0;i<_o0123456789ab.length;i++){const x=_o0123456789ab[i];let d='';for(let j=0;j<x.length;j++)d+=String.fromCharCode(x.charCodeAt(j)^5);_o0123456789ab[i]=d;}console.log(_o0123456789ab[Date.now()%1]);`;
  const result=recoverObfuscatedStrings(code,'script');
  assert.equal(result.code,code);
  assert.equal(result.tables,0);
  assert.equal(result.literals,0);
  assert.equal(result.diagnostics.length,1);
});

test('inline call-callee array literal is conservatively excluded from encoding',()=>{
  const source=`'use strict';module.exports=['first-long-literal','second-long-literal',
    'first-long-literal'].join('::');`;
  const emitted=obfuscateFiles([{path:'inline.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'inline-operand-source-guard',properties:false
  });
  assert.equal(emitted.files[0].metrics.literals,0);
  const recovered=recoverObfuscatedStrings(String(emitted.files[0].code),'commonjs');
  assert.equal(recovered.tables,0);
  assert.equal(execute(String(emitted.files[0].code)),execute(source));
});
