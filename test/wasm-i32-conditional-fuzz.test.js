'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

const boundaries=[-2147483648,-1,0,1,2,31,32,2147483647];
const operations=['&','|','^','<<','>>','>>>'];
let state=0x7629be53;

/** @returns {number} */
function next(){
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}

/** @param {string[]} names @returns {string} */
function leaf(names){
  if(next()%3===0)return names[next()%names.length];
  return String(boundaries[next()%boundaries.length]);
}

/**
 * Deterministic grammar-bounded bitvector+conditional AST sampler. It never
 * generates calls, property reads, mutation, getters or nonprimitive values.
 * @param {number} depth
 * @param {string[]} names
 * @returns {string}
 */
function expression(depth,names){
  if(depth===0)return leaf(names);
  const choice=next()%10;
  if(choice<=2){
    return '('+expression(depth-1,names)+'?'+expression(depth-1,names)+
      ':'+expression(depth-1,names)+')';
  }
  if(choice===3)return '(~'+expression(depth-1,names)+')';
  return '('+expression(depth-1,names)+operations[next()%operations.length]+
    expression(depth-1,names)+')';
}

/** @param {string} code @returns {(...args:number[])=>number} */
function load(code){
  const module={exports:null};
  vm.runInNewContext(code,{module,globalThis},{timeout:3000});
  return /** @type {(...args:number[])=>number} */(
    /** @type {unknown} */(module.exports));
}

test('reproducible nested conditional fuzz: native, select, lazy, auto and seedless bytecode clone',{
  timeout:60000
},()=>{
  let emitted=0,declined=0,comparisons=0,reconstructed=0;
  for(let sample=0;sample<110;sample++){
    const names=['a','b','c','d'].slice(0,1+sample%4);
    const depth=2+sample%3;
    // Keep the outer expression in the compiler's explicit opt-in grammar.
    const mode=sample%3;
    const expr=mode===0?'('+expression(depth-1,names)+'?'+
      expression(depth-1,names)+':'+expression(depth-1,names)+')':
      mode===1?'(~'+expression(depth-1,names)+')':
      '('+expression(depth-1,names)+operations[next()%operations.length]+
      expression(depth-1,names)+')';
    const source='function f('+names.join(',')+'){return '+expr+';}module.exports=f;';
    const original=load(source);
    for(const strategy of /** @type {('auto'|'select'|'if')[]} */(['auto','select','if'])){
      const result=lowerWasmI32Functions(source,'commonjs',{
        seed:'conditional-fuzz-'+sample+'-'+strategy,names:['f'],
        conditionalStrategy:strategy
      });
      if(result.functions===0){
        assert.equal(result.declined,1);
        assert.equal(result.code,source);
        declined++;
        continue;
      }
      assert.equal(result.functions,1);
      emitted++;
      const compiled=load(result.code);
      const recovered=recoverPublicWasmExpression(result.code,names);
      const cloned=load('function f('+names.join(',')+'){return '+
        recovered.expression+';}module.exports=f;');
      reconstructed++;
      for(let trial=0;trial<120;trial++){
        const args=names.map((_,i)=>trial<boundaries.length?
          boundaries[(trial+i)%boundaries.length]:(next()|0));
        const expected=original(...args);
        assert.ok(Object.is(compiled(...args),expected),
          'Compiler mismatch at sample '+sample+'/'+strategy+'/'+trial);
        assert.ok(Object.is(cloned(...args),expected),
          'Source-only clone mismatch at sample '+sample+'/'+strategy+'/'+trial);
        comparisons++;
      }
    }
  }
  assert.ok(emitted>200,'Need substantive positive grammar coverage');
  assert.equal(reconstructed,emitted);
  assert.equal(emitted+declined,330);
  console.log(JSON.stringify({
    tool:'nested-conditional-fuzz',seed:'0x7629be53',
    expressions:110,strategies:3,emitted,declined,
    staticReconstructed:reconstructed,typedComparisons:comparisons
  }));
});
