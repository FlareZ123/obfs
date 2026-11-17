'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {recoverAllPublicWasmExpressions}=
  require('../sims/wasm-i32-static-recover');
const {reconstructPublicWasmCommonJs}=
  require('../sims/wasm-i32-native-rebuild');

/**
 * @param {string} source
 * @returns {{first:(a:number,b:number)=>number,second:(x:number)=>number}}
 */
function load(source) {
  const module={exports:/** @type {unknown} */(null)};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return /** @type {{first:(a:number,b:number)=>number,second:(x:number)=>number}} */(module.exports);
}

let randomState=0x5e0b18d4;
/** @returns {number} */
function randomI32() {
  randomState^=randomState<<13;
  randomState^=randomState>>>17;
  randomState^=randomState<<5;
  return randomState|0;
}

test('public-only Wasm bytecode reconstruction still clones deferred CommonJS output',()=>{
  const originalSource='function first(a,b){return ((a^b)&255);}\n'+
    'function second(x){return x?((x^17)&255):((~x)|7);}\n'+
    'module.exports={first,second};';
  const original=load(originalSource);
  let reconstructed=0,checks=0;
  for(let seed=0;seed<16;seed++) {
    const published=lowerWasmI32Functions(originalSource,'commonjs',{
      seed:'deferred-static-attacker-'+seed,names:['first','second'],
      deferCommonJsInitialization:true
    });
    assert.equal(published.functions,2);
    const inferred=recoverAllPublicWasmExpressions(published.code,[['a','b'],['x']]);
    assert.equal(inferred.length,2);
    assert.ok(inferred.every(item=>item.bytes>25));
    // The earlier syntax-specific CommonJS rewriter handles eager helpers
    // only. Its refusal must not be counted as a confidentiality barrier:
    // the standalone public-binary reconstructor above still recovers both
    // selected operations without the compiler, seed or original source.
    assert.throws(()=>reconstructPublicWasmCommonJs(published.code),TypeError);
    const replacementCode='function first(a,b){return '+inferred[0].expression+';}'+
      'function second(x){return '+inferred[1].expression+';}'+
      'module.exports={first,second};';
    const replacement=load(replacementCode);
    const actual=load(published.code);
    assert.doesNotMatch(replacementCode,/WebAssembly|Uint8Array/u);
    for(let i=0;i<256;i++) {
      const a=randomI32(),b=randomI32(),x=randomI32();
      assert.ok(Object.is(replacement.first(a,b),original.first(a,b)));
      assert.ok(Object.is(actual.first(a,b),original.first(a,b)));
      assert.ok(Object.is(replacement.second(x),original.second(x)));
      assert.ok(Object.is(actual.second(x),original.second(x)));
      checks+=4;
    }
    reconstructed++;
  }
  assert.equal(reconstructed,16);
  assert.equal(checks,16384);
});
