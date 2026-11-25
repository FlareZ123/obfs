'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runInNewContext}=require('node:vm');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source @returns {ReturnType<typeof summarizeAmbientCallEffects>} */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {ReturnType<typeof analyze>} result @param {string} name */
function named(result,name) {
  return result.summaries.filter(summary=>summary.bindingNames.includes(name));
}

/** @param {string} source @param {Record<string,unknown>} [extra] @returns {unknown[]} */
function execute(source,extra={}) {
  /** @type {unknown[]} */
  const captured=[];
  runInNewContext(source,{...extra,external(value){captured.push(value);}});
  return captured;
}

/** @param {string} source @returns {ReturnType<ReturnType<typeof analyze>['summaries']['slice']>[number]} */
function hiddenSummary(source) {
  const summary=named(analyze(source),'hidden')[0];
  assert.ok(summary,'the hidden function must have an analysis summary');
  return summary;
}

test('object getter resolves this.callback against its actual receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){return this.callback;}};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.match(String(captured),/return 1/);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('object method resolves this.callback against its actual receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,getCallback(){return this.callback;}};'+
    'external(owner.getCallback());';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.match(String(captured),/return 1/);
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('object getter resolves a primitive this-field without retaining callable siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,get result(){return this.count;}};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});

test('object method resolves a primitive this-field without retaining callable siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,count:1,getCount(){return this.count;}};'+
    'external(owner.getCount());';
  const [captured]=execute(source);
  assert.equal(captured,1);
  assert.equal(hiddenSummary(source).hostHeldCallable,false);
  assert.equal(hiddenSummary(source).safe,true);
});

test('nested static this-member chains resolve through receiver records',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={state:{callback:hidden},get result(){return this.state.callback;}};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an inherited object getter keeps the original object as its receiver',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const prototype={get result(){return this.callback;}};'+
    'const owner={__proto__:prototype,callback:hidden};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('a literal-computed this-member key resolves precisely',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){return this["callback"];}};'+
    'external(owner.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('an unresolved computed this-member key fails closed over receiver callables',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const key=selectKey();'+
    'const owner={callback:hidden,get result(){return this[key];}};'+
    'external(owner.result);';
  const [captured]=execute(source,{selectKey:()=> 'callback'});
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});

test('optional object getter access preserves receiver-bound callable flow',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,get result(){return this.callback;}};'+
    'external(owner?.result);';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(hiddenSummary(source).hostHeldCallable,true);
});
