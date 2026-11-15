'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

/**
 * Nested grammar fuzz uses deterministic xorshift32 and no original/compiler
 * implementation information in the separate source-only static attacker.
 * @returns {number}
 */
let state=0x8457bd3b;
function next() {
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}

/** @param {number} depth @returns {string} */
function expression(depth) {
  if(depth===0) {
    if(next()%3===0)return 'x';
    const boundaries=[0,1,-1,255,65535,2147483647,-2147483648];
    return String(boundaries[next()%boundaries.length]);
  }
  if(next()%9===0)return '(~'+expression(depth-1)+')';
  const ops=['&','|','^','<<','>>','>>>'];
  return '('+expression(depth-1)+ops[next()%ops.length]+expression(depth-1)+')';
}

/** @param {string} source @returns {(x:number)=>number} */
function load(source) {
  /** @type {{exports:unknown}} */
  const module={exports:null};
  vm.runInNewContext(source,{module,globalThis},{timeout:2000});
  return /** @type {(x:number)=>number} */(module.exports);
}

test('nested native/Wasm and independent-source reconstruction differential fuzz',()=>{
  const selected=[-2147483648,-1,0,1,2147483647,NaN,Infinity,-Infinity];
  let nativeComparisons=0,staticComparisons=0,reconstructed=0,declined=0;
  for(let index=0;index<120;index++) {
    const expr=expression(2+(index%4));
    const source='function f(x){return '+expr+';}module.exports=f;';
    const original=load(source);
    for(let variant=0;variant<3;variant++) {
      const generated=lowerWasmI32Functions(source,'commonjs',{
        seed:'nested-wasm-fuzz-'+index+'/'+variant,names:['f']
      });
      if(generated.functions===0) {
        declined++;
        continue;
      }
      assert.equal(generated.functions,1,expr);
      const compiled=load(generated.code);
      const recovered=recoverPublicWasmExpression(generated.code);
      const cloned=load('function f(x){return '+recovered.expression+';}module.exports=f;');
      reconstructed++;
      for(let j=0;j<60;j++) {
        const input=j<selected.length?selected[j]:(next()|0);
        const originalValue=original(input);
        assert.ok(Object.is(compiled(input),originalValue),
          'Compiler diff at tree '+index+' seed '+variant+' input '+String(input));
        assert.ok(Object.is(cloned(input),originalValue),
          'Static recovery diff at tree '+index+' seed '+variant+' input '+String(input));
        nativeComparisons++;
        staticComparisons++;
      }
    }
  }
  assert.equal(declined,0);
  assert.equal(reconstructed,360);
  assert.equal(nativeComparisons,21600);
  assert.equal(staticComparisons,21600);
  console.log(JSON.stringify({nestedTrees:120,variants:360,nativeComparisons,
    staticComparisons,seed:'0x8457bd3b'}));
});
