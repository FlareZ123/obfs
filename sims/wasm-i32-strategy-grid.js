'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {extractPublicWasm,recoverPublicWasmExpression}=
  require('./wasm-i32-static-recover');

const heavyA='((((b^c)^(d<<5))&((b|d)^(c>>>3)))^'+
  '((((d^b)&(c|7))<<(b&7))|((c^d)>>>2)))';
const heavyB='((((b^d)&(c>>>2))^((c|b)<<(d&7)))|'+
  '((((b^c)<<3)&(d|1))^((c^d)>>>5)))';
const cases=[
  {name:'balanced-minimal',expression:'(a?(b^c):(c^d))'},
  {name:'asymmetric-true',expression:'(a?'+heavyA+':d)'},
  {name:'asymmetric-false',expression:'(a?d:'+heavyA+')'},
  {name:'balanced-heavy',expression:'(a?'+heavyA+':'+heavyB+')'}
];

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
 * Observe source-provided 0/32 to 32/32 branch frequencies in a loop.
 * All four supplied values are primitive signed Int32 Numbers.
 * @param {(a:number,b:number,c:number,d:number)=>number} fn
 * @param {number} trueCount
 * @param {number} iterations
 * @returns {number}
 */
function work(fn,trueCount,iterations){
  let sum=0;
  for(let i=0;i<iterations;i++){
    const a=(i&31)<trueCount?((i+1)|0):0;
    sum^=fn(a,(i*1664525)|0,(i*1013904223)|0,(i*69069)|0);
  }
  return sum|0;
}

/**
 * Compile three independently callable variants. Keep compiler generation
 * time separate from the chargeable client Wasm module loading time.
 * @param {string} source
 * @param {'auto'|'select'|'if'} strategy
 * @returns {{func:(a:number,b:number,c:number,d:number)=>number,initMs:number,bytes:number,source:string}}
 */
function lower(source,strategy){
  const built=lowerWasmI32Functions(source,'commonjs',{
    seed:'strategy-grid-20261116',names:['kernel'],conditionalStrategy:strategy
  });
  assert.equal(built.functions,1);
  const begin=performance.now();
  const func=load(built.code);
  const initMs=performance.now()-begin;
  const recovered=recoverPublicWasmExpression(built.code,['a','b','c','d']);
  assert.ok(recovered.expression.includes('?'));
  return {func,initMs,bytes:extractPublicWasm(built.code).length,source:recovered.expression};
}

/**
 * Run a deterministic grid, preserving warm timings and validation evidence
 * rather than inferring a universal 2.5x bound from a single benchmark.
 */
function main(){
  const beginAll=performance.now();
  let comparisons=0;
  /** @type {unknown[]} */
  const rows=[];
  for(const candidate of cases){
    const source='function kernel(a,b,c,d){return '+candidate.expression+
      ';}module.exports=kernel;';
    const nativeBegin=performance.now();
    const native=load(source);
    const nativeInitMs=performance.now()-nativeBegin;
    const variants={
      auto:lower(source,'auto'),
      eager:lower(source,'select'),
      lazy:lower(source,'if')
    };
    for(const trueCount of [0,1,16,31,32]){
      for(let i=0;i<128;i++){
        const args=/** @type {[number,number,number,number]} */([
          (i&31)<trueCount?i+1:0,(i*1664525)|0,(i*1013904223)|0,(i*69069)|0
        ]);
        const expected=native(...args);
        assert.equal(variants.auto.func(...args),expected);
        assert.equal(variants.eager.func(...args),expected);
        assert.equal(variants.lazy.func(...args),expected);
        comparisons++;
      }
      for(let i=0;i<5;i++){
        const checksum=work(native,trueCount,120000);
        assert.equal(work(variants.auto.func,trueCount,120000),checksum);
        assert.equal(work(variants.eager.func,trueCount,120000),checksum);
        assert.equal(work(variants.lazy.func,trueCount,120000),checksum);
      }
      /** @type {Record<string,number[]>} */
      const timings={native:[],auto:[],eager:[],lazy:[]};
      const pairs=/** @type {Array<[string,(a:number,b:number,c:number,d:number)=>number]>} */ ([
        ['native',native],['auto',variants.auto.func],['eager',variants.eager.func],
        ['lazy',variants.lazy.func]
      ]);
      for(let trial=0;trial<13;trial++){
        const order=trial%2?[...pairs].reverse():pairs;
        for(const [key,fn] of order){
          const start=performance.now();
          work(fn,trueCount,120000);
          timings[key].push(performance.now()-start);
        }
      }
      const n=median(timings.native);
      const row={
        case:candidate.name,trueFraction:trueCount+'/32',nativeMs:n,
        autoMs:median(timings.auto),eagerMs:median(timings.eager),
        lazyMs:median(timings.lazy),
        autoRatio:median(timings.auto)/n,
        eagerRatio:median(timings.eager)/n,
        lazyRatio:median(timings.lazy)/n,
        autoWithin2_5:median(timings.auto)/n<=2.5,
        nativeInitMs,autoInitMs:variants.auto.initMs,
        eagerInitMs:variants.eager.initMs,lazyInitMs:variants.lazy.initMs,
        autoBytes:variants.auto.bytes,eagerBytes:variants.eager.bytes,
        lazyBytes:variants.lazy.bytes
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
  console.log(JSON.stringify({
    tool:'i32-conditional-strategy-grid',node:process.version,
    platform:process.platform,caseCount:cases.length,frequencyCount:5,
    compared:comparisons,totalMs:performance.now()-beginAll,rows:rows.length
  }));
}

if(require.main===module)main();
module.exports={main};
