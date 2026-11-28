'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasWeakMapPrototypeExposure}=require('../src/ast');

/**
 * Enumerate all 16 path choices of four unknown Boolean conditions. The
 * scanner may refuse extra ordinary cases, but it may never miss a path
 * reaching native WeakMap.prototype. This finite grammar is not a proof for
 * imported objects, proxies, opaque functions, or actual obfuscated output.
 */
test('symbolic branch WeakMap provenance safely overapproximates 600 modules',()=>{
  let seed=0x48D9B17;
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
  let anyWeakMap=0;
  let ordinary=0;
  let falseSafe=0;
  let unnecessaryVeto=0;
  for(let trial=0;trial<600;trial++){
    let source='const root={instance:{}};let a=root;let b=root;';
    for(let branch=0;branch<4;branch++){
      const consequent=choice(),alternate=choice();
      source+='if(t'+branch+'){'+consequent+'}else{'+alternate+'}';
    }
    source+='const nativePrototype=Object.getPrototypeOf(b.instance);';
    const execute=Function('t0','t1','t2','t3','"use strict";'+source+
      ';return nativePrototype===WeakMap.prototype;');
    let couldBeWeakMap=false;
    for(let mask=0;mask<16;mask++){
      const flags=[0,1,2,3].map(index=>Boolean(mask&(1<<index)));
      if(execute(...flags))couldBeWeakMap=true;
    }
    const observed=hasWeakMapPrototypeExposure(parse(source,'module'));
    if(couldBeWeakMap){
      anyWeakMap++;
      if(!observed){
        falseSafe++;
        assert.fail('false-safe seed=0x48D9B17 trial='+trial+' source='+source);
      }
    }else{
      ordinary++;
      if(observed)unnecessaryVeto++;
    }
  }
  assert.equal(anyWeakMap,505);
  assert.equal(ordinary,95);
  assert.equal(falseSafe,0);
  assert.ok(unnecessaryVeto<=73,
    'precision regression: '+unnecessaryVeto+' conservative ordinary vetoes');
});
