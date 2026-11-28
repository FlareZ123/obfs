'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasWeakMapPrototypeExposure}=require('../src/ast');

/**
 * Independently execute a bound constructor through native V8, then ask the
 * actual production scanner whether its instance may expose the native
 * WeakMap.prototype. The paired ordinary case demands positive precision.
 * This is a bounded analyzer falsifier, not standalone COO/SNO/SCO parity.
 * @type {ReadonlyArray<{name:string,constructor:string,expected:boolean}>}
 */
const cases=[
  {
    name:'Reflect.apply Function.prototype.bind returns native WeakMap constructor',
    constructor:'Reflect.apply(Function.prototype.bind,WeakMap,[null])',
    expected:true
  },
  {
    name:'Reflect.apply of native bind through a const alias',
    constructor:'Reflect.apply(Function.prototype.bind,WeakMap,[undefined])',
    expected:true
  },
  {
    name:'Reflect.apply bound ordinary class remains ordinary',
    constructor:'Reflect.apply(Function.prototype.bind,Ordinary,[null])',
    expected:false
  }
];

for(const item of cases)test(item.name,()=>{
  const source='class Ordinary{};const C='+item.constructor+';'+
    'const carrier={instance:new C()};'+
    'const nativePrototype=Object.getPrototypeOf(carrier.instance);';
  const native=Function('"use strict";'+source+
    'return nativePrototype===WeakMap.prototype;')();
  assert.equal(native,item.expected,'V8 native truth differs from control');
  const scanner=hasWeakMapPrototypeExposure(parse(source,'module'));
  assert.equal(scanner,item.expected,
    'source scanner must preserve native WeakMap provenance; source='+source);
});
