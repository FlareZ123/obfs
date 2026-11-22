'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * Execute as a non-strict CommonJS module to retain standard caller access.
 * @param {string} code
 * @returns {string}
 */
function outcome(code) {
  const exported={};
  const sandbox={module:{exports:exported},exports:exported};
  vm.runInNewContext(code,sandbox,{timeout:1500});
  return JSON.stringify(sandbox.module.exports);
}

/**
 * Obfuscate a single locally analyzed CommonJS module with the canonical
 * public-callable source-preservation policy enabled.
 * @param {string} code
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(code) {
  return obfuscateFiles([{path:'entry.cjs',code,sourceType:'commonjs'}],{
    mode:'sno',seed:'caller-source-observer-peer',
    preservePublicCallableSource:true,
    strings:false,identifiers:false,properties:true
  }).files[0];
}

test('private direct-call reader source remains observable through sloppy caller',()=>{
  const source=[
    'const owner={secretField:17,otherField:5};',
    'function observer(){const parent=observer.caller;',
    'return String(parent).includes("secretField")?2:3;}',
    'function reader(){return observer()+owner.secretField;}',
    'module.exports=[reader(),owner.otherField];'
  ].join('\n');
  const output=compile(source);
  assert.equal(outcome(source),JSON.stringify([19,5]));
  assert.equal(outcome(output.code),outcome(source),output.code);
  assert.equal(output.metrics.objects,0,'Caller-source observer must preserve source spelling: '+output.code);
});

test('ordinary direct-call reader still admits a private owner mapping',()=>{
  const source=[
    'const owner={secretField:17,otherField:5};',
    'function observer(){return 2;}',
    'function reader(){return observer()+owner.secretField;}',
    'module.exports=[reader(),owner.otherField];'
  ].join('\n');
  const output=compile(source);
  assert.equal(outcome(output.code),outcome(source),output.code);
  assert.ok(output.metrics.objects>0,output.code);
});
