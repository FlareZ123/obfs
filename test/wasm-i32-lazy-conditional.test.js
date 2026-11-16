'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {extractPublicWasm,recoverPublicWasmExpression}=
  require('../sims/wasm-i32-static-recover');

const heavy='((((b^c)^(d<<5))&((b|d)^(c>>>3)))^'+
  '((((d^b)&(c|7))<<(b&7))|((c^d)>>>2)))';

/** @param {string} code @returns {(a:number,b:number,c:number,d:number)=>number} */
function load(code){
  const module={exports:null};
  vm.runInNewContext(code,{module,globalThis},{timeout:3000});
  return /** @type {(a:number,b:number,c:number,d:number)=>number} */ (
    /** @type {unknown} */ (module.exports));
}

/** @param {number[]} values @returns {number} */
function median(values){return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];}

/**
 * Detect the i32-result structured block from the public bytecode. This is
 * only a structural canary; attacker also reconstructs its complete graph.
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
function hasIfI32(bytes){
  for(let i=0;i<bytes.length-1;i++)if(bytes[i]===0x04&&bytes[i+1]===0x7f)return true;
  return false;
}

test('cost-aware auto chooses lazy if, explicit select stays eager and both remain statically recoverable',()=>{
  const source='function f(a,b,c,d){return (a?'+heavy+':d);}module.exports=f;';
  const seed='lazy-if-20261116-coverage';
  /** @param {'auto'|'select'|'if'} conditionalStrategy */
  function compile(conditionalStrategy){
    return lowerWasmI32Functions(source,'commonjs',{
      seed,names:['f'],conditionalStrategy
    });
  }
  const automatic=compile('auto'),eager=compile('select'),lazy=compile('if');
  for(const result of [automatic,eager,lazy])assert.equal(result.functions,1);
  assert.ok(hasIfI32(extractPublicWasm(automatic.code)),
    'Asymmetry should select a lazy structured Wasm if/else');
  assert.ok(hasIfI32(extractPublicWasm(lazy.code)));
  assert.ok(extractPublicWasm(eager.code).includes(0x1b),
    'Explicit select strategy should select both operands');
  assert.equal(automatic.code,lazy.code,
    'The chosen asymmetric graph should use the lazy strategy by default');
  const native=load(source);
  const variants=[automatic,eager,lazy].map(result=>{
    const recovered=recoverPublicWasmExpression(result.code,['a','b','c','d']);
    assert.ok(recovered.expression.includes('?'));
    return {compiled:load(result.code),
      attacker:load('function f(a,b,c,d){return '+recovered.expression+';}module.exports=f;')};
  });
  for(let i=0;i<4096;i++){
    const a=i%32===0?((i*17)|0):0;
    const args=/** @type {[number,number,number,number]} */([
      a,(i*1664525)|0,(i*1013904223)|0,(i*69069)|0
    ]);
    const original=native(...args);
    for(const {compiled,attacker} of variants){
      assert.equal(compiled(...args),original);
      assert.equal(attacker(...args),original);
    }
  }
  /** @param {typeof native} fn @returns {number} */
  function work(fn){
    let sum=0;
    for(let i=0;i<120000;i++){
      const a=i%32===0?i|0:0;
      sum^=fn(a,(i*1664525)|0,(i*1013904223)|0,(i*69069)|0);
    }
    return sum;
  }
  for(let i=0;i<5;i++){
    assert.equal(work(native),work(variants[0].compiled));
    assert.equal(work(native),work(variants[1].compiled));
  }
  /** @type {number[]} */
  const nativeTimes=[];
  /** @type {number[]} */
  const autoTimes=[];
  /** @type {number[]} */
  const eagerTimes=[];
  for(let trial=0;trial<13;trial++){
    /** @type {[typeof native,number[]][]} */
    const pair=trial%2===0?
      [[native,nativeTimes],[variants[0].compiled,autoTimes],[variants[1].compiled,eagerTimes]]:
      [[variants[1].compiled,eagerTimes],[variants[0].compiled,autoTimes],[native,nativeTimes]];
    for(const [fn,values] of pair){
      const start=performance.now();
      work(fn);
      values.push(performance.now()-start);
    }
  }
  console.log(JSON.stringify({
    sample:'asymmetric-conditional',typedComparisons:4096,
    staticRecovery:{auto:true,lazy:true,eager:true},
    nativeMs:median(nativeTimes),autoMs:median(autoTimes),eagerMs:median(eagerTimes),
    autoRatio:median(autoTimes)/median(nativeTimes),
    eagerRatio:median(eagerTimes)/median(nativeTimes),
    wasmBytesAuto:extractPublicWasm(automatic.code).length,
    wasmBytesEager:extractPublicWasm(eager.code).length
  }));
});

test('nested structured if maintains stack operands and the source-only attacker reconstructs it',()=>{
  const source='function f(a,b,c,d){return ((a?'+heavy+':d)^(a&3));}module.exports=f;';
  const native=load(source);
  for(const strategy of /** @type {('if'|'auto')[]} */ (['if','auto'])){
    const generated=lowerWasmI32Functions(source,'commonjs',{
      seed:'nested-if-20261116',names:['f'],conditionalStrategy:strategy
    });
    assert.equal(generated.functions,1);
    assert.ok(hasIfI32(extractPublicWasm(generated.code)));
    const recovered=recoverPublicWasmExpression(generated.code,['a','b','c','d']);
    const lowered=load(generated.code);
    const attacker=load('function f(a,b,c,d){return '+recovered.expression+';}module.exports=f;');
    for(let i=0;i<1024;i++){
      const args=/** @type {[number,number,number,number]} */([
        i%31===0?(i*17)|0:0,(i*1664525)|0,(i*1013904223)|0,(i*69069)|0
      ]);
      assert.equal(lowered(...args),native(...args));
      assert.equal(attacker(...args),native(...args));
    }
  }
});

test('invalid conditional strategies fail closed before compilation',()=>{
  assert.throws(()=>lowerWasmI32Functions(
    'function f(x){return (x?x:0);}module.exports=f;','commonjs',{
      seed:'invalid',names:['f'],conditionalStrategy:/** @type {any} */ ('never')
    }
  ),/Expected source, module type, seed and explicit function names/u);
});

test('large balanced conditional arms use lazy Wasm if with exact independent recovery',()=>{
  const heavyB='((((b^d)&(c>>>2))^((c|b)<<(d&7)))|'+
    '((((b^c)<<3)&(d|1))^((c^d)>>>5)))';
  const source='function f(a,b,c,d){return (a?'+heavy+':'+heavyB+');}module.exports=f;';
  const original=load(source);
  const automatic=lowerWasmI32Functions(source,'commonjs',{
    seed:'balanced-lazy-grid-20261116',names:['f']
  });
  const lazy=lowerWasmI32Functions(source,'commonjs',{
    seed:'balanced-lazy-grid-20261116',names:['f'],conditionalStrategy:'if'
  });
  const eager=lowerWasmI32Functions(source,'commonjs',{
    seed:'balanced-lazy-grid-20261116',names:['f'],conditionalStrategy:'select'
  });
  assert.equal(automatic.functions,1);
  assert.ok(hasIfI32(extractPublicWasm(automatic.code)));
  assert.equal(automatic.code,lazy.code);
  assert.notEqual(automatic.code,eager.code);
  const recovered=recoverPublicWasmExpression(automatic.code,['a','b','c','d']);
  const reconstructed=load('function f(a,b,c,d){return '+
    recovered.expression+';}module.exports=f;');
  const compiled=load(automatic.code);
  const select=load(eager.code);
  for(let i=0;i<1024;i++){
    const args=/** @type {[number,number,number,number]} */([
      i%2?(i*17)|0:0,(i*1664525)|0,(i*1013904223)|0,(i*69069)|0
    ]);
    const expected=original(...args);
    assert.equal(compiled(...args),expected);
    assert.equal(select(...args),expected);
    assert.equal(reconstructed(...args),expected);
  }
});
