'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasWeakMapPrototypeExposure}=require('../src/ast');

/**
 * Native V8 semantics are the control, not a previous analyzer's opinion.
 * Each shape yields a constructible bound WeakMap with shared native prototype;
 * ordinary counterparts are independent positive-precision controls.
 * This bounded corpus is a falsifier, not an assertion of universal coverage.
 * @type {ReadonlyArray<readonly [string,string]>}
 */
const constructorExpressions=[
 ['direct-bind','Function.prototype.bind.call(WeakMap,null)'],
 ['bind-apply','Function.prototype.bind.apply(WeakMap,[null])'],
 ['reflect-apply','Reflect.apply(Function.prototype.bind,WeakMap,[null])'],
 ['alias-function','Reflect.apply((()=>{const F=Function;return F.prototype.bind})(),WeakMap,[null])'],
 ['alias-bind','Reflect.apply((()=>{const b0=Function.prototype.bind;const b1=b0;return b1})(),WeakMap,[null])'],
 ['nested-reflect-apply','Reflect.apply(Reflect.apply,Reflect,[Function.prototype.bind,WeakMap,[null]])'],
 ['descriptor','Reflect.apply(Object.getOwnPropertyDescriptor(Function.prototype,"bind").value,WeakMap,[null])'],
 ['reflect-get','Reflect.apply(Reflect.get(Function.prototype,"bind"),WeakMap,[null])'],
 ['inherited-bind','Reflect.apply(Object.getPrototypeOf(function f(){}).bind,WeakMap,[null])'],
 ['prebound-bind','Reflect.apply(Function.prototype.bind.bind(WeakMap),null,[null])'],
 ['computed-bind','Reflect.apply(Function.prototype["bi"+"nd"],WeakMap,[null])'],
 ['computed-apply','Reflect["ap"+"ply"](Function.prototype.bind,WeakMap,[null])'],
 ['transparent-proxy','Reflect.apply(new Proxy(Function.prototype.bind,{}),WeakMap,[null])'],
 ['array-index','Reflect.apply([Function.prototype.bind][0],WeakMap,[null])'],
 ['map-lookup','Reflect.apply(new Map([["b",Function.prototype.bind]]).get("b"),WeakMap,[null])'],
 ['call-parameter','Reflect.apply((x=>x)(Function.prototype.bind),WeakMap,[null])'],
 ['call-return','Reflect.apply((()=>Function.prototype.bind)(),WeakMap,[null])'],
 ['intrinsic-apply-invocation','Reflect.apply(Function.prototype.apply,Function.prototype.bind,[WeakMap,[null]])'],
 ['intrinsic-call-invocation','Reflect.apply(Function.prototype.call,Function.prototype.bind,[WeakMap,null])'],
 ['prebound-call','Function.prototype.call.bind(Function.prototype.bind)(WeakMap,null)']
];

for(const [name,expression] of constructorExpressions) {
  test('may WeakMap origin via '+name,()=>{
    const source='class Ordinary{};const C='+expression+';'+
      'const holder={instance:new C()};'+
      'const prototype=Object.getPrototypeOf(holder.instance);';
    const actual=Function('"use strict";'+source+
      'return prototype===WeakMap.prototype;')();
    assert.equal(actual,true,'Native control unexpectedly changed: '+name);
    const scanner=hasWeakMapPrototypeExposure(parse(source,'module'));
    assert.equal(scanner,true,
      'FALSE-SAFE native WeakMap constructor: '+name+' source='+source);
  });

  test('ordinary control for '+name,()=>{
    const source='class Ordinary{};const C='+expression.replaceAll('WeakMap','Ordinary')+';'+
      'const holder={instance:new C()};'+
      'const prototype=Object.getPrototypeOf(holder.instance);';
    const actual=Function('"use strict";'+source+
      'return prototype===WeakMap.prototype;')();
    assert.equal(actual,false,'Ordinary control unexpectedly native: '+name);
    const scanner=hasWeakMapPrototypeExposure(parse(source,'module'));
    assert.equal(scanner,false,
      'Overrefusal of a proven ordinary instance: '+name+' source='+source);
  });
}