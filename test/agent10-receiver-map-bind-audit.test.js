'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runInNewContext}=require('node:vm');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/**
 * @param {string} source
 * @returns {ReturnType<typeof summarizeAmbientCallEffects>}
 */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/**
 * @param {ReturnType<typeof analyze>} result
 * @param {string} name
 */
function named(result,name) {
  return result.summaries.filter(summary=>summary.bindingNames.includes(name));
}

/**
 * @param {boolean} includeBoundResultEscape
 * @returns {string}
 */
function sourceFor(includeBoundResultEscape) {
  return '(function run(){'+\n    'const owner={secretField:7};'+
    'const nativeBind=Function.prototype.bind;'+
    'Function.prototype.bind=function(){'+
    'external(this);const target=this;'+
    'return (...args)=>Reflect.apply(target,null,args);};'+
    'const internal=()=>owner.secretField;'+
    'const hot=internal.bind(null);'+
    'const result=hot();'+
    'Function.prototype.bind=nativeBind;'+
    (includeBoundResultEscape?'external(hot);':'');
}

test('custom bind this-only escape is conservatively rejected without a HostHeldCallable reason',()=>{
  const source=sourceFor(false);
  /** @type {unknown[]} */
  const captured=[];
  runInNewContext(source,{
    external(value){captured.push(value);}
  });
  assert.equal(typeof captured[0],'function');
  assert.match(String(captured[0]),/owner\.secretField/);
  const summary=named(analyze(source),'internal')[0];
  assert.ok(summary,'internal must have an ambient-call summary');
  assert.equal(summary.hostHeldCallable,false);
  assert.equal(summary.safe,false);
  console.log(JSON.stringify({hostHeldCallable:summary.hostHeldCallable,externallyReachable:summary.externallyReachable,dynamicFrame:summary.dynamicFrame,safe:summary.safe,reasons:summary.reasons}));
});

test('control: explicit escape of the bind result resolves back to the target',()=>{
  const source=sourceFor(true);
  const summary=named(analyze(source),'internal')[0];
  assert.ok(summary,'internal must have an ambient-call summary');
  assert.equal(summary.hostHeldCallable,true);
  assert.equal(summary.safe,false);
});
