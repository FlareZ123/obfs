'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');

/** @param {number} count @returns {string} */
function makeSource(count) {
  return Array.from({length:count},(_,i)=>
    'function f'+i+'(x){return ((x^'+(17+i)+')&((x<<2)|63));}')
    .join('\n')+'\nmodule.exports=f0;';
}

/** @param {string} code @returns {(x:number)=>number} */
function load(code) {
  const module={exports:/** @type {unknown} */(null)};
  vm.runInNewContext(code,{module,globalThis},{timeout:5000});
  return /** @type {(x:number)=>number} */(module.exports);
}

/** @param {(x:number)=>number} fn @param {number} count @returns {number} */
function work(fn,count) {
  let checksum=0;
  for(let i=0;i<count;i++)checksum^=fn((i*1664525)|0);
  return checksum|0;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

for(const selectedCount of [1,8,24]) {
  const native=makeSource(selectedCount);
  const names=Array.from({length:selectedCount},(_,i)=>'f'+i);
  const base={seed:'runtime-only-deferred-'+selectedCount,names};
  const eager=lowerWasmI32Functions(native,'commonjs',base);
  const lazy=lowerWasmI32Functions(native,'commonjs',{
    ...base,deferCommonJsInitialization:true
  });
  assert.equal(lazy.functions,selectedCount);
  assert.equal(eager.functions,selectedCount);
  const variants={native,eager:eager.code,lazy:lazy.code};
  for(const events of [1,16,256,4096,65536]) {
    const numbers={
      native:/** @type {number[]} */([]),
      eager:/** @type {number[]} */([]),
      lazy:/** @type {number[]} */([])
    };
    const expected=work(load(native),events);
    for(let trial=0;trial<21;trial++) {
      const variantsOrder=/** @type {('native'|'eager'|'lazy')[]} */(
        ['native','eager','lazy']);
      const order=variantsOrder.slice(trial%3).concat(variantsOrder.slice(0,trial%3));
      for(const mode of order) {
        const fn=load(variants[mode]); // Eligible SNO startup is outside timer.
        const start=process.hrtime.bigint();
        const got=work(fn,events); // Includes first-call lazy Wasm compile.
        const elapsed=Number(process.hrtime.bigint()-start)/1000000;
        assert.equal(got,expected);
        numbers[mode].push(elapsed);
      }
    }
    const eagerRatios=numbers.eager.map((value,index)=>value/numbers.native[index]);
    const lazyRatios=numbers.lazy.map((value,index)=>value/numbers.native[index]);
    console.log(JSON.stringify({
      experiment:'sno-commonjs-runtime-only',selectedCount,executedCount:1,
      events,trials:numbers.native.length,
      initializationIncluded:false,firstLazyCompileIncluded:true,
      runtimeMedianMs:{
        native:median(numbers.native),eager:median(numbers.eager),
        lazy:median(numbers.lazy)
      },
      ratioOfMedians:{
        eager:median(numbers.eager)/median(numbers.native),
        lazy:median(numbers.lazy)/median(numbers.native)
      },
      pairedRatioMedians:{eager:median(eagerRatios),lazy:median(lazyRatios)},
      lazyPairsOver2_5:lazyRatios.filter(value=>value>2.5).length,
      rawRuntimeMs:numbers,
      note:'These small process-clock samples do not certify worst-case overhead, JS JIT stability or a representative service workload.'
    }));
  }
}
