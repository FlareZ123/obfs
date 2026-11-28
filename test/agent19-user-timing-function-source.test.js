'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src');

/**
 * Execute against the actual Node User Timing intrinsic. Using a stub that
 * calls String() would test a different host boundary.
 * @param {string} source
 * @returns {{observed:string,value:number}}
 */
function execute(source) {
  const sandbox={module:{exports:null},performance,require};
  vm.runInNewContext(source,sandbox,{timeout:3000});
  return JSON.parse(JSON.stringify(sandbox.module.exports));
}

/** @param {string} expression @returns {string} */
function fixture(expression) {
  return "'use strict';"+
    "const owner={secretField:47};"+
    "function inspect(){return owner.secretField;}"+
    "const observed="+expression+";"+
    "module.exports={observed,value:inspect()};";
}

const forms=[
  ['direct mark','performance.mark(inspect).name'],
  ['aliased receiver','(()=>{const timing=performance;return timing.mark(inspect).name;})()'],
  ['global mark','globalThis.performance.mark(inspect).name'],
  ['bound mark','(()=>{const mark=performance.mark.bind(performance);return mark(inspect).name;})()'],
  ['call mark','performance.mark.call(performance,inspect).name'],
  ['reflective mark','Reflect.apply(performance.mark,performance,[inspect]).name'],
  ['computed method','performance["mark"](inspect).name'],
  ['native perf_hooks require','require("node:perf_hooks").performance.mark(inspect).name'],
  ['native perf_hooks destructured require',
    '(()=>{const {performance:native}=require("node:perf_hooks");return native.mark(inspect).name;})()'],
  ['record-carried native mark',
    '(()=>{const hooks={native:performance.mark};return hooks.native.call(performance,inspect).name;})()'],
  ['record-assigned native mark',
    '(()=>{const hooks={};hooks.native=performance.mark;return Reflect.apply(hooks.native,performance,[inspect]).name;})()'],
  ['record-alias native mark',
    '(()=>{const hooks={native:performance.mark};const copy=hooks;return copy.native.call(performance,inspect).name;})()'],
  ['record-destructured native mark',
    '(()=>{const hooks={native:performance.mark};const {native:call}=hooks;return call.call(performance,inspect).name;})()']
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const [name,expression] of forms) {
    test(mode+' exact native performance.mark Function source: '+name,()=>{
      const original=fixture(expression);
      const emitted=obfuscateFiles([{path:'timing.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'agent19-user-timing/'+mode+'/'+name,strings:true
      }).files[0];
      const native=execute(original),obfuscated=execute(emitted.code);
      assert.match(native.observed,/secretField/);
      assert.equal(native.value,47);
      assert.deepEqual(obfuscated,native,
        'Native User Timing mark name contains the original Function source; emitted='+emitted.code);
      assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
        'User Timing native String conversion is a source observer');
      assert.equal(emitted.metrics.objects,0,'An observed owner must not rewrite');
    });
  }
  test(mode+' permits unrelated private-property rewrite for primitive User Timing name',()=>{
    const original="'use strict';const owner={privateField:47};"+
      "performance.mark('fixed User Timing literal');"+
      "module.exports={observed:'fixed',value:owner.privateField};";
    const emitted=obfuscateFiles([{path:'primitive.cjs',sourceType:'commonjs',code:original}],{
      mode,seed:'agent19-user-timing-primitive/'+mode,strings:false
    }).files[0];
    assert.deepEqual(execute(emitted.code),execute(original));
    assert.equal(observesFunctionSource(parse(original,'commonjs')),false);
    assert.ok(emitted.metrics.objects>0,
      'A primitive mark must not suppress independent own-key renaming');
  });
}
