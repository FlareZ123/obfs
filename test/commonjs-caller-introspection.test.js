'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * Execute an ordinary non-strict CommonJS body and return what the exported
 * entry point observes from its private callee.
 * @param {string} code
 * @returns {string}
 */
function readObservedSource(code) {
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:3000});
  const invoke=context.module.exports;
  if(typeof invoke!=='function')throw new TypeError('Expected callable module export');
  return String(invoke());
}

/** @param {'caller-member'|'prototype-call'|'no-observer'} variant @returns {string} */
function program(variant) {
  const suffix=variant==='caller-member'?'return inspect.caller.toString();':
    variant==='prototype-call'?
      'return Function.prototype.toString.call(inspect.caller);':
      'return "a fixed result";';
  return 'function publicEntry(){return privateTarget();}\n'+
    'function privateTarget(){const privatePayload="caller-observable-private-body-string";'+
    'return inspect();}\n'+
    'function inspect(){'+suffix+'}\n'+
    'module.exports=publicEntry;';
}

test('a sloppy CommonJS helper may observe a direct-only private caller source',()=>{
  const opts={mode:/** @type {const} */('sno'),seed:'caller-source-review',
    strings:true,identifiers:false,properties:false,
    preservePublicCallableSource:true};
  const harmless=program('no-observer');
  const harmlessOutput=obfuscateFiles([{path:'entry.cjs',code:harmless}],opts);
  assert.notEqual(harmlessOutput.files[0].code,harmless,
    'A source-private direct caller should retain string encoding yield');
  assert.equal(readObservedSource(String(harmlessOutput.files[0].code)),
    readObservedSource(harmless));
  for(const variant of /** @type {const} */(['caller-member','prototype-call'])) {
    const source=program(variant);
    const output=obfuscateFiles([{path:'entry.cjs',code:source}],opts);
    assert.equal(readObservedSource(String(output.files[0].code)),
      readObservedSource(source),
      'Private caller source is exposed through '+variant+
        ' despite direct-only lexical function references');
  }
});
