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
  runInNewContext(source, {
    /** @param {unknown} value */
    external(value) { captured.push(value); }
  });
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
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
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
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
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
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
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
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
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
  assert.equal((/** @type {Function} */ (captured)).name,'harmless');
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
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,false);
});

test('call with a primitive-returning method does not retain receiver callback siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};external(owner.read.call(other));';
  const [captured]=execute(source);
  assert.equal(captured,7);
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,false);
  assert.equal(summaryFor(source,'hidden').safe,true);
});

test('apply with a primitive-returning method does not retain receiver callback siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};external(owner.read.apply(other,[]));';
  const [captured]=execute(source);
  assert.equal(captured,7);
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,false);
  assert.equal(summaryFor(source,'hidden').safe,true);
});

test('a bound primitive-returning method does not retain receiver callback siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};const bound=owner.read.bind(other);'+
    'external(bound());';
  const [captured]=execute(source);
  assert.equal(captured,7);
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,false);
  assert.equal(summaryFor(source,'hidden').safe,true);
});

test('Reflect.apply with a primitive-returning method does not retain receiver callback siblings',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};'+
    'external(Reflect.apply(owner.read,other,[]));';
  const [captured]=execute(source);
  assert.equal(captured,7);
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,false);
  assert.equal(summaryFor(source,'hidden').safe,true);
});

test('a source-local Function.prototype.call override disables the intrinsic shortcut',()=>{
  const source=
    'function hidden(){return 1;}'+
    'Function.prototype.call=function(receiver){return receiver.callback;};'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};external(owner.read.call(other));';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
});

test('a source-local Reflect.apply override disables the intrinsic shortcut',()=>{
  const source=
    'function hidden(){return 1;}'+
    'Reflect.apply=function(fn,receiver,args){return receiver.callback;};'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};'+
    'external(Reflect.apply(owner.read,other,[]));';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
});

test('an aliased Object.defineProperty mutation disables the call intrinsic shortcut',()=>{
  const source=
    'function hidden(){return 1;}const define=Object.defineProperty;'+
    'define(Function.prototype,"call",{value:function(receiver){return receiver.callback;}});'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};external(owner.read.call(other));';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
});

test('an aliased Reflect.set mutation disables the Reflect.apply intrinsic shortcut',()=>{
  const source=
    'function hidden(){return 1;}const set=Reflect.set;'+
    'set(Reflect,"apply",function(fn,receiver,args){return receiver.callback;});'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};'+
    'external(Reflect.apply(owner.read,other,[]));';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
});

test('call receiver flows into an arrow returned by the local method',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'const owner={make(){return ()=>this.callback;}};'+
    'const other={callback:hidden};external(owner.make.call(other)());';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,false);
});

test('apply receiver flows into an arrow returned by the local method',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'const owner={make(){return ()=>this.callback;}};'+
    'const other={callback:hidden};external(owner.make.apply(other,[])());';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,false);
});

test('bind receiver flows into an arrow returned by the local method',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'const owner={make(){return ()=>this.callback;}};'+
    'const other={callback:hidden};const bound=owner.make.bind(other);'+
    'external(bound()());';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,false);
});

test('Reflect.apply receiver flows into an arrow returned by the local method',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'const owner={make(){return ()=>this.callback;}};'+
    'const other={callback:hidden};'+
    'external(Reflect.apply(owner.make,other,[])());';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,false);
});

test('a nested ordinary function does not inherit its creator method receiver',()=>{
  const source=
    'function hidden(){return 1;}function harmless(){return 0;}'+
    'const owner={make(){return function(){return this.callback;};}};'+
    'const other={callback:hidden};const actual={callback:harmless};'+
    'external(owner.make.call(other).call(actual));';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'harmless');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,false);
  assert.equal(summaryFor(source,'harmless').hostHeldCallable,true);
});


test('destructured Object.defineProperty can mutate Function.prototype.call before analysis',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const {defineProperty}=Object;'+
    'defineProperty(Function.prototype,"call",{value:function(receiver){return receiver.callback;}});'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};external(owner.read.call(other));';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
});

test('a globalThis.Object mutator alias cannot preserve the intrinsic assumption',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const objectConstructor=globalThis.Object;'+
    'const define=objectConstructor.defineProperty;'+
    'define(Function.prototype,"call",{value:function(receiver){return receiver.callback;}});'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};external(owner.read.call(other));';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
});

test('destructured Reflect.set can replace Reflect.apply before analysis',()=>{
  const source=
    'function hidden(){return 1;}'+
    'const {set}=Reflect;'+
    'set(Reflect,"apply",function(fn,receiver,args){return receiver.callback;});'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};'+
    'external(Reflect.apply(owner.read,other,[]));';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
});


test('globalThis.Reflect replacement disables the intrinsic assumption',()=>{
  const source=
    'function hidden(){return 1;}'+
    'globalThis.Reflect={apply:function(fn,receiver,args){return receiver.callback;}};'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};'+
    'external(Reflect.apply(owner.read,other,[]));';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
});

test('a Function constructor can mutate Function.prototype.call before analysis',()=>{
  const source=
    'function hidden(){return 1;}'+
    'Function("Function.prototype.call = function(receiver){return receiver.callback;}")();'+
    'const owner={read(){return this.count;}};'+
    'const other={count:7,callback:hidden};external(owner.read.call(other));';
  const [captured]=execute(source);
  assert.equal((/** @type {Function} */ (captured)).name,'hidden');
  assert.equal(summaryFor(source,'hidden').hostHeldCallable,true);
});
