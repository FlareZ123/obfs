'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasWeakMapPrototypeExposure}=require('../src/ast');

/**
 * Reproducible bounded-language falsifier, not a universal soundness proof.
 * Every if condition is a literal Boolean; every receiver is a local ordinary
 * record or a WeakMap. The result is exactly observable using the native VM.
 * Cross-branch aliases and ordinary/WeakMap writes are deliberately mixed.
 */
test('literal branch WeakMap provenance matches native on 1200 generated modules',()=>{
  let seed=0x48A11A5;
  /** @returns {number} */
  function rand(){
    seed^=seed<<13;
    seed^=seed>>>17;
    seed^=seed<<5;
    return (seed>>>0)/4294967296;
  }
  /** @type {readonly string[]} */
  const operations=[
    'a=b;', 'b=a;', 'a=root;', 'b=root;',
    'a={instance:{}};', 'b={instance:{instance:{}}};',
    'a={instance:new WeakMap()};', 'b={instance:new WeakMap()};',
    'a.instance=new WeakMap();', 'b.instance=new WeakMap();',
    'a.instance={};', 'b.instance={};'
  ];
  /** @returns {string} */
  function choice(){
    return operations[Math.floor(rand()*operations.length)];
  }
  let weakMapResults=0;
  let ordinaryResults=0;
  for(let trial=0;trial<1200;trial++){
    let source='const root={instance:{}};let a=root;let b=root;';
    for(let branch=0;branch<4;branch++){
      const testValue=rand()<0.5;
      const consequent=choice(),alternate=choice();
      source+='if('+testValue+'){'+consequent+'}else{'+alternate+'}';
    }
    source+='const nativePrototype=Object.getPrototypeOf(b.instance);';
    const native=Function('"use strict";'+source+
      ';return nativePrototype===WeakMap.prototype;')();
    const observed=hasWeakMapPrototypeExposure(parse(source,'module'));
    assert.equal(observed,native,'seed=0x48A11A5 trial='+trial+' source='+source);
    if(native)weakMapResults++;
    else ordinaryResults++;
  }
  assert.equal(weakMapResults,534);
  assert.equal(ordinaryResults,666);
});
