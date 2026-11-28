'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,hasWeakMapPrototypeExposure}=require('../src/ast');

/**
 * Finite, deterministic native-V8 existential oracle for constructor origins
 * passed through Function.prototype.bind, Reflect.apply, and local aliases.
 * Exercises a four-branch may-alias CFG over mutable shared records.
 * Neither the language nor the assertion is a universal JavaScript proof:
 * no eval, Proxy traps, exotic getters, imported intrinsics or concurrent
 * mutation is modeled. The ordinary-only controls forbid an always-veto rule.
 */
test('native bound constructor aliases retain WeakMap source provenance across symbolic record flow',()=>{
  let seed=0x3A92B73;
  /** @returns {number} */
  function random() {
    seed^=seed<<13;
    seed^=seed>>>17;
    seed^=seed<<5;
    return (seed>>>0)/4294967296;
  }
  /** @param {readonly string[]} expressions @returns {string} */
  function pick(expressions) {
    return expressions[Math.floor(random()*expressions.length)];
  }
  const weakExpressions=[
    'new WeakMap()',
    'new (WeakMap.bind(null))()',
    'new (Reflect.apply(Function.prototype.bind,WeakMap,[null]))()',
    'new (Function.prototype.bind.apply(WeakMap,[null]))()',
    'new (R.apply(binder1,W,[null]))()',
    'Reflect.construct(W,[])',
    'new (R.apply(F.prototype.bind,W,[undefined]))()'
  ];
  const ordinaryExpressions=[
    'new Ordinary()',
    'new (Ordinary.bind(null))()',
    'new (Reflect.apply(Function.prototype.bind,Ordinary,[null]))()',
    'new (R.apply(binder1,Ordinary,[null]))()',
    'Reflect.construct(Ordinary,[])'
  ];
  let weakTrials=0,ordinaryTrials=0,precision=0;
  for(let trial=0;trial<320;trial++) {
    const ordinaryOnly=trial%4===0;
    const values=ordinaryOnly?ordinaryExpressions:
      [...weakExpressions,...ordinaryExpressions];
    const make=()=>pick(values);
    const rootValue=make();
    let source='class Ordinary{};const F=Function;const R=Reflect;'+
      'const W='+(ordinaryOnly?'Ordinary':'WeakMap')+';'+
      'const binder0=F.prototype.bind;const binder1=binder0;'+
      'const root={instance:'+rootValue+'};let a=root;let b=root;';
    for(let branch=0;branch<4;branch++) {
      /** @returns {string} */
      function operation() {
        switch(Math.floor(random()*6)) {
          case 0:return 'a={instance:'+make()+'};';
          case 1:return 'b={instance:'+make()+'};';
          case 2:return 'a.instance='+make()+';';
          case 3:return 'b.instance='+make()+';';
          case 4:return 'a=b;';
          default:return 'b=a;';
        }
      }
      source+='if(t'+branch+'){'+operation()+'}else{'+operation()+'}';
    }
    source+='const nativePrototype=Object.getPrototypeOf(b.instance);';
    const native=Function('t0','t1','t2','t3','"use strict";'+source+
      ';return nativePrototype===WeakMap.prototype;');
    let mayBeWeakMap=false;
    for(let mask=0;mask<16;mask++) {
      const argumentsForMask=[0,1,2,3].map(bit=>Boolean(mask&(1<<bit)));
      if(native(...argumentsForMask))mayBeWeakMap=true;
    }
    const scanned=hasWeakMapPrototypeExposure(parse(source,'module'));
    if(mayBeWeakMap) {
      weakTrials++;
      assert.ok(scanned,'false-safe; seed=0x3A92B73 trial='+trial+' '+source);
    } else {
      ordinaryTrials++;
      if(!scanned)precision++;
    }
  }
  assert.ok(weakTrials>100,'insufficient possible-native cases');
  assert.ok(ordinaryTrials>45,'insufficient ordinary-only cases');
  assert.ok(precision>=30,'vacuous or overwhelmingly conservative guard');
});
