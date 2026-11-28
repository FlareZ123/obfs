'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {{text:string,value:number}} */
function execute(code) {
  const ctx={module:{exports:null},performance};
  vm.runInNewContext(code,ctx,{timeout:3000});
  return JSON.parse(JSON.stringify(ctx.module.exports));
}
/** @param {string} body @returns {string} */
function fixture(body) {
  return "'use strict';"+
    "function inspect(){const state={secretField:61};return state.secretField;}"+
    "const text=(()=>{"+body+"})();module.exports={text,value:inspect()};";
}

const parameterCases=[
  ['direct function receiver parameter',
    'function publish(timing,fn){return timing.mark(fn).name;}return publish(performance,inspect);'],
  ['arrow function receiver parameter',
    'const publish=(timing,fn)=>timing.mark(fn).name;return publish(performance,inspect);'],
  ['alias of receiver parameter',
    'function publish(timing,fn){const alias=timing;return alias.mark(fn).name;}return publish(performance,inspect);'],
  ['function method parameter',
    'function publish(mark,fn){return mark.call(performance,fn).name;}return publish(performance.mark,inspect);'],
  ['function object-carrier parameter',
    'function publish(hooks,fn){return hooks.mark.call(performance,fn).name;}return publish({mark:performance.mark},inspect);'],
  ['function resolved through immutable alias',
    'function publish(timing,fn){return timing.mark(fn).name;}const alias=publish;return alias(performance,inspect);'],
  ['function returning a receiver',
    'function retrieve(){return performance;}const alias=retrieve();return alias.mark(inspect).name;'],
  ['function identity forwarding receiver',
    'function identity(timing){return timing;}const alias=identity(performance);return alias.mark(inspect).name;'],
  ['function returning method carrier',
    'function holder(){return {native:performance.mark};}return holder().native.call(performance,inspect).name;']
];

for(const mode of /** @type {const} */(['coo','sco','sno'])) {
  for(const [name,body] of parameterCases) {
    test(mode+' interprocedural native User Timing source safety: '+name,()=>{
      const original=fixture(body),native=execute(original);
      assert.match(native.text,/secretField/u,'Actual native mark source witness');
      assert.equal(native.value,61);
      const mutated=execute(original.replaceAll('secretField','otherPrivateLabel'));
      assert.notEqual(mutated.text,native.text,
        'The native host observes the exact original Function source');
      const file=obfuscateFiles([{path:'timing.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'agent19-timing-parameter/'+mode+'/'+name,strings:true
      }).files[0];
      assert.deepEqual(execute(file.code),native,
        'Interprocedural receiver transport must retain original Function source');
      assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
        'Bounded direct receiver parameter flow should recognize the host source sink');
      assert.equal(file.metrics.objects,0,
        'Source-observed Function body cannot safely rename its local object keys');
    });
  }
}
