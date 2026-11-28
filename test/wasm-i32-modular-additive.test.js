'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');
const {recoverPublicWasmExpression,extractPublicWasm}=
  require('../sims/wasm-i32-static-recover');

/** @param {string} source @returns {(...args:number[])=>number} */
function load(source) {
  const module={exports:null};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return /** @type {(...args:number[])=>number} */ (
    /** @type {unknown} */ (module.exports));
}

let random=0x67c9b5a1;
/** @returns {number} */
function i32() {
  random^=random<<13;
  random^=random>>>17;
  random^=random<<5;
  return random|0;
}
const boundary=[-2147483648,-2147483647,-1,0,1,2,31,32,2147483647];

/** @type {{args:string,expression:string,arithmetic:string}[]} */
const accepted=[
  {args:'a,b',expression:'((a+b)|0)',arithmetic:'+'},
  {args:'a,b',expression:'((a-b)>>>0)',arithmetic:'-'},
  {args:'a,b,c',expression:'(((a+b)+c)&255)',arithmetic:'+'},
  {args:'a,b,c',expression:'(((a-b)-(c>>>0))|0)',arithmetic:'-'},
  {args:'a,b,c,d',expression:'(((a+b)>>>(c-d))^a)',arithmetic:'+'},
  {args:'a,b,c,d',expression:'((a?((b+c)|0):((b-c)|0))^d)',arithmetic:'+'},
  {args:'a,b,c,d',expression:'((a?b+c:d-b)>>>0)',arithmetic:'+'},
  {args:'a,b,c,d',expression:'(~((a+b)-(c+d)))',arithmetic:'+'}
];

test('Wasm i32 modular addition/subtraction matches typed Number behavior and is statically recovered',()=>{
  let variants=0,comparisons=0;
  for(const [index,example] of accepted.entries()) {
    const source='function f('+example.args+'){return '+example.expression+';}module.exports=f;';
    const native=load(source);
    const params=example.args.split(',');
    for(let seed=0;seed<8;seed++) {
      const result=lowerWasmI32Functions(source,'commonjs',{
        seed:'modular-add-'+index+'-'+seed,names:['f']
      });
      assert.equal(result.functions,1,example.expression);
      assert.equal(result.declined,0,example.expression);
      const bin=extractPublicWasm(result.code);
      assert.ok(bin.includes(example.arithmetic==='+'?0x6a:0x6b));
      const observed=load(result.code);
      const recovered=recoverPublicWasmExpression(result.code,params);
      assert.ok(recovered.expression.includes(example.arithmetic),
        'Independent attacker should decode the arithmetic: '+recovered.expression);
      const copied=load('function f('+example.args+'){return '+
        recovered.expression+';}module.exports=f;');
      for(let i=0;i<512;i++) {
        const args=params.map((_,position)=>i<boundary.length?
          boundary[(i+position)%boundary.length]:i32());
        const expected=native(...args);
        assert.ok(Object.is(observed(...args),expected),
          'Wasm mismatch '+index+'/'+seed+'/'+i);
        assert.ok(Object.is(copied(...args),expected),
          'Source-only clone mismatch '+index+'/'+seed+'/'+i);
        comparisons++;
      }
      variants++;
    }
  }
  assert.equal(variants,64);
  assert.equal(comparisons,32768);
  console.log(JSON.stringify({modularVariants:variants,comparisons,
    sourceOnlyReconstructions:variants,seed:'0x67c9b5a1'}));
});

test('noncoerced addition/subtraction and conditional truthiness remain unchanged',()=>{
  for(const body of [
    '(a+b)', '(a-b)', 'a?(b+c):d', 'a?(b-c):d',
    '(a+b)?c:d', '((a+b)?c:d)|0', '((a-b)?c:d)>>>0',
    '((a+b)?(c^d):(c&d))', '(((a+b)?c:d)^a)',
    '((a-b)?(c+d):a)|0'
  ]) {
    const source='function f(a,b,c,d){return '+body+';}module.exports=f;';
    const result=lowerWasmI32Functions(source,'commonjs',{
      seed:'modular-negative-'+body,names:['f']
    });
    assert.equal(result.functions,0,body);
    assert.equal(result.declined,1,body);
    assert.equal(result.code,source,body);
  }
  // JS Number addition differs from wrapped Wasm on a truthiness boundary:
  assert.equal(((-2147483648)+(-2147483648))?1:0,1);
  assert.equal((((-2147483648)+(-2147483648))|0)?1:0,0);
});

test('COO ESM and SNO CJS opt-in backends support coerced arithmetic',async()=>{
  const expression='((a+b)-(c-d))|0';
  const esm='export function f(a,b,c,d){return '+expression+';}';
  const commonjs='function f(a,b,c,d){return '+expression+';}module.exports=f;';
  const coo=obfuscateFiles([{path:'modular.mjs',sourceType:'module',code:esm}],{
    mode:'coo',seed:'modular-coo',strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'modular.mjs':['f']}
  });
  const sno=obfuscateFiles([{path:'modular.cjs',sourceType:'commonjs',code:commonjs}],{
    mode:'sno',seed:'modular-sno',strings:false,properties:false,identifiers:false,
    experimentalWasmI32:{'modular.cjs':['f']}
  });
  assert.equal(coo.files[0].metrics.wasmI32Functions,1);
  assert.equal(sno.files[0].metrics.wasmI32Functions,1);
  const originalEsm=await import('data:text/javascript;base64,'+Buffer.from(esm).toString('base64'));
  const compiledEsm=await import('data:text/javascript;base64,'+
    Buffer.from(String(coo.files[0].code)).toString('base64'));
  const nativeCjs=load(commonjs),compiledCjs=load(String(sno.files[0].code));
  for(let i=0;i<2048;i++) {
    const args=boundary.length>i?
      [boundary[i],boundary[(i+1)%boundary.length],
        boundary[(i+2)%boundary.length],boundary[(i+3)%boundary.length]]:
      [i32(),i32(),i32(),i32()];
    assert.ok(Object.is(compiledEsm.f(...args),originalEsm.f(...args)));
    assert.ok(Object.is(compiledCjs(...args),nativeCjs(...args)));
  }
});
