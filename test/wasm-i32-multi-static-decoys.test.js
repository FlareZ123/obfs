'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');
const {extractPublicWasm,recoverAllPublicWasmExpressions,
  recoverPublicWasmExpression}=require('../sims/wasm-i32-static-recover');

// A forged full constructor in a source comment precedes the generated ones.
// A raw regex would incorrectly treat the comment as executable Wasm code.
const source='// new globalThis.WebAssembly.Module(globalThis.Uint8Array.from([1,2,3]))\n'+
  "'use strict';\n"+
  'function first(a){return ((a^137)&255);}\n'+
  'function second(b,c){return (((b|c)^31)<<1);}\n'+
  'module.exports={first,second};\n';

/**
 * @param {string} code
 * @returns {{first:(a:number)=>number,second:(b:number,c:number)=>number}}
 */
function load(code){
  const module={exports:{}};
  vm.runInNewContext(code,{module,globalThis},{timeout:3000});
  return /** @type {{first:(a:number)=>number,second:(b:number,c:number)=>number}} */(
    /** @type {unknown} */ (module.exports));
}

let randomState=0x6c67b8f5;
/** @returns {number} */
function randomI32(){
  randomState^=randomState<<13;
  randomState^=randomState>>>17;
  randomState^=randomState<<5;
  return randomState|0;
}

const expected=['((a^137)&255)','(((b|c)^31)<<1)'];
const parameterSets=[['a'],['b','c']];

test('public-only attacker selects both actual Wasm modules despite earlier decoy text',()=>{
  const native=load(source);
  let variants=0,checks=0;
  for(let seed=0;seed<12;seed++){
    const lowered=lowerWasmI32Functions(source,'commonjs',{
      seed:'decoy-multi-'+seed,names:['first','second']
    });
    assert.equal(lowered.functions,2);
    const decoy=lowered.code.indexOf('Uint8Array.from([1,2,3])');
    const firstModule=lowered.code.indexOf('new globalThis.WebAssembly.Instance(');
    assert.ok(decoy>=0&&decoy<firstModule);
    assert.ok(WebAssembly.validate(extractPublicWasm(lowered.code)));
    assert.equal(recoverPublicWasmExpression(lowered.code,'a').expression,expected[0]);
    const recovered=recoverAllPublicWasmExpressions(lowered.code,parameterSets);
    assert.deepEqual(recovered.map(item=>item.expression),expected);
    assert.ok(recovered[0].offset<recovered[1].offset);
    assert.ok(recovered.every(item=>item.bytes>30));
    assert.throws(()=>recoverAllPublicWasmExpressions(lowered.code,[['a']]),
      /parameter set/u);
    const compiled=load(lowered.code);
    const cloneA=/** @type {(a:number)=>number} */(
      Function('a','return '+recovered[0].expression+';'));
    const cloneB=/** @type {(b:number,c:number)=>number} */(
      Function('b','c','return '+recovered[1].expression+';'));
    for(let i=0;i<256;i++){
      const a=randomI32(),b=randomI32(),c=randomI32();
      assert.ok(Object.is(compiled.first(a),native.first(a)));
      assert.ok(Object.is(compiled.second(b,c),native.second(b,c)));
      assert.ok(Object.is(cloneA(a),native.first(a)));
      assert.ok(Object.is(cloneB(b,c),native.second(b,c)));
      checks+=4;
    }
    variants++;
  }
  assert.equal(variants,12);
  assert.equal(checks,12*256*4);
});

test('COO and SNO emitted multi-function files remain independently recoverable',()=>{
  const native=load(source);
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])){
    for(const seed of ['multi-pipeline-a','multi-pipeline-b','multi-pipeline-c']){
      const result=obfuscateFiles([{path:'kernel.cjs',
        sourceType:'commonjs',code:source}],{
        mode,seed,closedWorld:true,
        experimentalWasmI32:{'kernel.cjs':['first','second']},
        strings:false,properties:false,identifiers:false
      });
      const emitted=result.files[0];
      assert.equal(emitted.metrics.wasmI32Functions,2);
      const recovered=recoverAllPublicWasmExpressions(String(emitted.code),parameterSets);
      assert.deepEqual(recovered.map(item=>item.expression),expected);
      const compiled=load(String(emitted.code));
      for(let i=0;i<128;i++){
        const a=randomI32(),b=randomI32(),c=randomI32();
        assert.ok(Object.is(compiled.first(a),native.first(a)));
        assert.ok(Object.is(compiled.second(b,c),native.second(b,c)));
      }
    }
  }
});

test('multi-module scanner declines missing compiler constructors',()=>{
  assert.throws(()=>recoverAllPublicWasmExpressions(
    'const text="Uint8Array.from([0,97,115,109,1,0,0,0])";',[['x']]),
  /No compiler-emitted WebAssembly modules/u);
});


test('public-only scanner handles Node CommonJS top-level return grammar',()=>{
  const cjs='function sample(x){return (x^3);}\nmodule.exports=sample;\nreturn 42;\n';
  const lowered=lowerWasmI32Functions(cjs,'commonjs',{
    seed:'cjs-top-level-return',names:['sample']
  });
  assert.equal(lowered.functions,1);
  assert.equal(recoverAllPublicWasmExpressions(lowered.code,[['x']])[0].expression,'(x^3)');
});
