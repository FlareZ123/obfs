'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');
const {reconstructPublicWasmCommonJs}=
  require('../sims/wasm-i32-native-rebuild');

const source='// new globalThis.WebAssembly.Module(globalThis.Uint8Array.from([1,2,3]))\n'+
  "'use strict';\n"+
  'function first(a){return ((a^137)&255);}\n'+
  'function second(b,c){return (((b|c)^31)>>>0);}\n'+
  'module.exports={first,second};\n';

/**
 * @param {string} code
 * @param {object} wasmGlobal
 * @returns {{first:(a:number)=>number,second:(b:number,c:number)=>number}}
 */
function load(code,wasmGlobal){
  const module={exports:{}};
  vm.runInNewContext(code,{module,globalThis:wasmGlobal},{timeout:3000});
  return /** @type {{first:(a:number)=>number,second:(b:number,c:number)=>number}} */(
    /** @type {unknown} */ (module.exports));
}
let state=0x48c6e782;
/** @returns {number} */
function i32(){state^=state<<13;state^=state>>>17;state^=state<<5;return state|0;}

test('automated public-only native replacement needs no WebAssembly, original source or seed',()=>{
  const original=load(source,globalThis);
  assert.ok(original.second(-1,0)>0x7fffffff);
  let reconstructed=0,checks=0;
  for(let seed=0;seed<8;seed++){
    const emitted=lowerWasmI32Functions(source,'commonjs',{
      seed:'rebuild-'+seed,names:['first','second']
    });
    assert.equal(emitted.functions,2);
    const attack=reconstructPublicWasmCommonJs(emitted.code);
    assert.deepEqual(attack.functions.map(item=>item.name),['first','second']);
    assert.deepEqual(attack.functions.map(item=>item.parameters),[['a'],['b','c']]);
    assert.deepEqual(attack.functions.map(item=>item.expression),
      ['((a^137)&255)','(((b|c)^31)>>>0)']);
    assert.ok(attack.replacementBytes<attack.sourceBytes);
    assert.doesNotMatch(attack.code,/WebAssembly|Uint8Array/u);
    const compiled=load(emitted.code,globalThis);
    // Deliberately exclude Wasm from the attacker's replacement runtime.
    const replacement=load(attack.code,Object.freeze({}));
    assert.deepEqual(Object.keys(replacement).sort(),['first','second']);
    for(let i=0;i<256;i++){
      const a=i32(),b=i32(),c=i32();
      assert.ok(Object.is(replacement.first(a),original.first(a)));
      assert.ok(Object.is(compiled.first(a),original.first(a)));
      assert.ok(Object.is(replacement.second(b,c),original.second(b,c)));
      assert.ok(Object.is(compiled.second(b,c),original.second(b,c)));
      checks+=4;
    }
    reconstructed++;
  }
  assert.equal(reconstructed,8);
  assert.equal(checks,8*256*4);
});

test('COO and SNO full compiler output can be replaced by a public native module',()=>{
  const original=load(source,globalThis);
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])){
    for(const seed of ['rebuild-coo-sno-a','rebuild-coo-sno-b']){
      const result=obfuscateFiles([{path:'api.cjs',
        sourceType:'commonjs',code:source}],{
        mode,seed,closedWorld:true,strings:false,identifiers:false,properties:false,
        experimentalWasmI32:{'api.cjs':['first','second']}
      });
      assert.equal(result.files[0].metrics.wasmI32Functions,2);
      const emitted=String(result.files[0].code);
      const attack=reconstructPublicWasmCommonJs(emitted);
      const output=load(attack.code,Object.freeze({}));
      assert.equal(output.first(-1),original.first(-1));
      assert.equal(output.second(-2147483648,123),original.second(-2147483648,123));
    }
  }
});

test('native rebuild declines unrelated top-level effects even with valid emitted modules',()=>{
  const lowered=lowerWasmI32Functions(source,'commonjs',{
    seed:'no-discarded-effect',names:['first','second']
  });
  assert.equal(lowered.functions,2);
  for(const extra of [
    'console.log("unreviewed");\n',
    'const unrelated=37;\n',
    'function unrelated(){return 1;}\n'
  ])assert.throws(()=>reconstructPublicWasmCommonJs(extra+lowered.code),TypeError);
});

test('native reconstruction refuses an embedded Wasm constructor with extra initializer work',()=>{
  const lowered=lowerWasmI32Functions(source,'commonjs',{
    seed:'no-unproved-initializer',names:['first','second']
  });
  assert.equal(lowered.functions,2);
  const polluted=lowered.code.replace('.exports.f;','.exports.f||0;');
  assert.notEqual(polluted,lowered.code);
  assert.throws(()=>reconstructPublicWasmCommonJs(polluted),
    /Unproved CommonJS initializer/u);
});

test('native rebuild refuses an incomplete, noncompiler or ambiguous exported graph',()=>{
  for(const delivered of [
    'function first(a){return a;}module.exports={first};',
    'const a=1;module.exports={first:a};',
    'function first(a){return a;}module.exports={first};module.exports={first};',
    'const a=1;module.exports={first:a,first:a};',
    'module.exports=function(x){return x;}'
  ]){
    assert.throws(()=>reconstructPublicWasmCommonJs(delivered),TypeError);
  }
});
