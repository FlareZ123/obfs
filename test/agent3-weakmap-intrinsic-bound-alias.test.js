'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasWeakMapPrototypeExposure}=require('../src/ast');

/**
 * Native Node-V8 witness for local intrinsic-function alias transmission.
 * This matrix deliberately separates native brand from scanner source-safety
 * inference; the compiler parity test covers the higher level. No dynamic
 * Proxy traps, eval or imported binding behavior is asserted here.
 * @type {ReadonlyArray<{name:string,setup:string,expected:boolean}>}
 */
const cases=[
 {name:'direct intrinsic bind local alias',
  setup:'const binder=Function.prototype.bind; const C=Reflect.apply(binder,WeakMap,[null]);',
  expected:true},
 {name:'transitive intrinsic bind local aliases',
  setup:'const binder0=Function.prototype.bind;const binder1=binder0;const C=Reflect.apply(binder1,WeakMap,[null]);',
  expected:true},
 {name:'alias of the Function constructor',
  setup:'const F=Function; const C=Reflect.apply(F.prototype.bind,WeakMap,[null]);',
  expected:true},
 {name:'alias of the Reflect namespace',
  setup:'const R=Reflect; const C=R.apply(Function.prototype.bind,WeakMap,[null]);',
  expected:true},
 {name:'alias of the WeakMap constructor',
  setup:'const W=WeakMap; const C=Reflect.apply(Function.prototype.bind,W,[null]);',
  expected:true},
 {name:'ordinary aliased bound constructor retains positive precision',
  setup:'class Ordinary{};const binder=Function.prototype.bind;const C=Reflect.apply(binder,Ordinary,[null]);',
  expected:false}
];

for(const item of cases)test(item.name,()=>{
  const source=item.setup+'const carrier={instance:new C()};'+
    'const prototype=Object.getPrototypeOf(carrier.instance);';
  const native=Function('"use strict";'+source+
    'return prototype===WeakMap.prototype;')();
  assert.equal(native,item.expected,'native V8 result differs from frozen control');
  const scanner=hasWeakMapPrototypeExposure(parse(source,'module'));
  assert.equal(scanner,item.expected,'unsound or overrefusing path: '+source);
});
