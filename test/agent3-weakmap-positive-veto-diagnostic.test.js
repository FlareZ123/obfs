'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasWeakMapPrototypeExposure}=require('../src/ast');

/**
 * A finite native-V8 reference oracle for reflective constructor recovery
 * *combined* with four symbolic alias/rebinding branches. Native truth is
 * existential over all 16 Boolean worlds. The scanner may be conservative,
 * but must never say "ordinary" if any world reaches WeakMap.prototype.
 * This grammar does not include proxies with traps, imported objects, eval,
 * dynamic keys, or arbitrary getters; it is not universal soundness evidence.
 */
test('diagnostic: reflective WeakMap positive-veto precision distribution',()=>{
  let seed=0x481F47;
  /** @returns {number} */
  function rand(){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return (seed>>>0)/4294967296;
  }
  /** @param {readonly string[]} alternatives @returns {string} */
  function pick(alternatives){
    return alternatives[Math.floor(rand()*alternatives.length)];
  }
  /** @type {readonly string[]} */
  const weakConstructors=[
    'new WeakMap()',
    'new (WeakMap.bind(null))()',
    'new (WeakMap.bind())()',
    'new (Reflect.get(globalThis,"WeakMap"))()',
    'Reflect.construct(WeakMap,[])',
    'Reflect["construct"](WeakMap,[])',
    'new (new Proxy(WeakMap,{}))()',
    'new (Object.getOwnPropertyDescriptor(globalThis,"WeakMap").value)()',
    'new (Function.prototype.bind.call(WeakMap,null))()'
  ];
  /** @type {readonly string[]} */
  const ordinaryConstructors=[
    'new Ordinary()',
    'Reflect.construct(Ordinary,[])',
    'new (Ordinary.bind())()',
    'new (new Proxy(Ordinary,{}))()',
    'new (Function.prototype.bind.call(Ordinary,null))()'
  ];
  let couldBeWeakMapCount=0;
  let ordinaryOnlyCount=0;
  let conservativeOrdinaryVetoes=0;
  for(let trial=0;trial<200;trial++){
    // Every fifth case has only ordinary constructors, so a flag-always-true
    // scanner fails the positive-yield precision bound below.
    const values=trial%5===0?ordinaryConstructors:
      [...weakConstructors,...ordinaryConstructors];
    const value=()=>pick(values);
    let source='class Ordinary{};const root={instance:'+value()+'};'+
      'let a=root;let b=root;';
    for(let index=0;index<4;index++){
      /** @returns {string} */
      function operation(){
        switch(Math.floor(rand()*6)){
          case 0:return 'a={instance:'+value()+'};';
          case 1:return 'b={instance:'+value()+'};';
          case 2:return 'a.instance='+value()+';';
          case 3:return 'b.instance='+value()+';';
          case 4:return 'a=b;';
          default:return 'b=a;';
        }
      }
      source+='if(t'+index+'){'+operation()+'}else{'+operation()+'}';
    }
    source+='const nativePrototype=Object.getPrototypeOf(b.instance);';
    const native=Function('t0','t1','t2','t3','"use strict";'+source+
      ';return nativePrototype===WeakMap.prototype;');
    let mayReachWeakMap=false;
    for(let mask=0;mask<16;mask++){
      const bools=[0,1,2,3].map(index=>Boolean(mask&(1<<index)));
      if(native(...bools))mayReachWeakMap=true;
    }
    const exposed=hasWeakMapPrototypeExposure(parse(source,'module'));
    if(mayReachWeakMap){
      couldBeWeakMapCount++;
      assert.ok(exposed,'false-safe trial '+trial+' seed=0x481F47: '+source);
    }else{
      ordinaryOnlyCount++;
      if(exposed) { if(conservativeOrdinaryVetoes<6)console.log('ORDINARY_VETO_WITNESS '+JSON.stringify({trial,source})); conservativeOrdinaryVetoes++; }
    }
  }
  assert.ok(couldBeWeakMapCount>=80,'insufficient native WeakMap coverage');
  assert.ok(ordinaryOnlyCount>=30,'insufficient native ordinary coverage');
  console.log('ORDINARY_VETO_COUNTS '+JSON.stringify({couldBeWeakMapCount,ordinaryOnlyCount,conservativeOrdinaryVetoes}));
});
