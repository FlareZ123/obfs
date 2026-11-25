'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runInNewContext}=require('node:vm');
const {parse}=require('../src/ast');
const {summarizeAmbientCallEffects}=require('../workplace/agent9-ambient-call-bindingid');

/** @param {string} source */
function analyze(source) {
  return summarizeAmbientCallEffects(parse(source,'commonjs'),'commonjs');
}

/** @param {string} source */
function execute(source) {
  /** @type {unknown[]} */
  const captured=[];
  runInNewContext(source,{external(value){captured.push(value);}});
  return captured;
}

/** @param {string} source @param {string} name */
function summaryFor(source,name) {
  const row=analyze(source).summaries.find(candidate=>candidate.bindingNames.includes(name));
  assert.ok(row,`expected a summary for ${name}`);
  return row;
}

test('Function.prototype.call uses its explicit receiver for returned members',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'const owner={callback:harmless,read(){return this.callback;}};'+
    'const other={callback:hidden};external(owner.read.call(other));';
  const [captured]=execute(source);
  assert.equal(typeof captured,'function');
  assert.equal(captured.name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,false);
});

test('Function.prototype.apply uses its explicit receiver for returned members',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'const owner={callback:harmless,read(){return this.callback;}};'+
    'const other={callback:hidden};external(owner.read.apply(other,[]));';
  const [captured]=execute(source);
  assert.equal(typeof captured,'function');
  assert.equal(captured.name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,false);
});

test('a bound method keeps the receiver supplied to bind when later invoked',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'const owner={callback:harmless,read(){return this.callback;}};'+
    'const other={callback:hidden};const bound=owner.read.bind(other);'+
    'external(bound());';
  const [captured]=execute(source);
  assert.equal(typeof captured,'function');
  assert.equal(captured.name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,false);
});

test('Reflect.apply uses its explicit receiver for returned members',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'const owner={callback:harmless,read(){return this.callback;}};'+
    'const other={callback:hidden};external(Reflect.apply(owner.read,other,[]));';
  const [captured]=execute(source);
  assert.equal(typeof captured,'function');
  assert.equal(captured.name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,false);
});

test('an explicit receiver alias is followed without borrowing the original owner',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'const owner={callback:hidden,read(){return this.callback;}};'+
    'const other={callback:harmless};const receiver=other;'+
    'external(owner.read.call(receiver));';
  const [captured]=execute(source);
  assert.equal(captured?.name,'harmless');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,false);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,true);
});

test('a primitive member from an explicit receiver does not retain unrelated callables',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={callback:hidden,read(){return this.count;}};'+
    'const other={count:7};external(owner.read.call(other));';
  const [captured]=execute(source);
  assert.equal(captured,7);
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,false);
  assert.equal(summaryFor(source,'hidden').safe,true);
});

test('class methods also use the explicit Function.prototype.call receiver',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'class Reader{read(){return this.callback;}}'+
    'const instance=new Reader();const other={callback:hidden};'+
    'external(instance.read.call(other));';
  const [captured]=execute(source);
  assert.equal(captured?.name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,false);
});
