'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

/** @typedef {'module'|'commonjs'} SourceType */

const privateI32='function secretI32(x){return (((x^137)&(x>>>3))|(x<<7));}';
const facade='function published(x){return secretI32(x);}';

/** @param {string} code @returns {(x:unknown)=>number} */
function loadCommonJs(code){
  const sandbox={module:{exports:null},globalThis};
  vm.runInNewContext(code,sandbox,{timeout:2000});
  return /** @type {(x:unknown)=>number} */(/** @type {unknown} */(sandbox.module.exports));
}

/** @param {string} source @returns {Promise<(x:unknown)=>number>} */
async function loadEsm(source){
  const url='data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64');
  const namespace=await import(url);
  return /** @type {(x:unknown)=>number} */(namespace.published);
}

/**
 * Side-effectful object values are intentionally outside the experimental
 * i32 numeric grammar. The original JS performs three ToNumeric operations
 * while the generated WebAssembly entrypoint converts its argument once.
 *
 * @param {'symbol'|'valueOf'|'second-throws'} kind
 * @returns {{value:object,reads:()=>number}}
 */
function makeProbe(kind){
  let reads=0;
  if(kind==='valueOf') {
    return {value:{valueOf(){reads++;return reads*5;}},reads:()=>reads};
  }
  return {value:{[Symbol.toPrimitive](){
    reads++;
    if(kind==='second-throws'&&reads===2)throw Error('second coercion observed');
    return reads*5;
  }},reads:()=>reads};
}

/**
 * @param {(x:unknown)=>number} fn
 * @param {'symbol'|'valueOf'|'second-throws'} kind
 * @returns {{reads:number,result:number|null,error:string|null}}
 */
function observe(fn,kind){
  const probe=makeProbe(kind);
  let result=null;
  let error=null;
  try { result=fn(probe.value); }
  catch(caught) {error=String(caught);}
  return {reads:probe.reads(),result,error};
}

test('experimental private Wasm i32 Number grammar does not cover coercible objects',async()=>{
  /** @type {{type:SourceType,mode:string,kind:string,native:ReturnType<typeof observe>,
   * emitted:ReturnType<typeof observe>,sourceExact:boolean,wasmFunctions:number}[]} */
  const rows=[];
  for(const type of /** @type {const} */ (['commonjs','module'])){
    const original=privateI32+(type==='module'?'export ':'')+facade+
      (type==='commonjs'?'module.exports=published;':'');
    const baseline=type==='module'?await loadEsm(original):loadCommonJs(original);
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const filename=type==='module'?'entry.mjs':'entry.cjs';
      const output=obfuscateFiles([{path:filename,sourceType:type,code:original}],{
        mode,seed:'agent38-private-wasm-object-boundary/'+type+'/'+mode,
        identifiers:false,properties:false,strings:false,
        experimentalWasmI32:{[filename]:['secretI32']}
      }).files[0];
      assert.equal(output.metrics.wasmI32Functions,1);
      const fn=type==='module'?await loadEsm(String(output.code)):
        loadCommonJs(String(output.code));
      const sourceExact=Function.prototype.toString.call(baseline)===
        Function.prototype.toString.call(fn);
      for(const kind of /** @type {const} */(['symbol','valueOf','second-throws'])){
        const native=observe(baseline,kind),emitted=observe(fn,kind);
        rows.push({type,mode,kind,native,emitted,sourceExact,
          wasmFunctions:output.metrics.wasmI32Functions});
        assert.equal(native.reads,kind==='second-throws'?2:3);
        assert.equal(emitted.reads,1);
        assert.notDeepEqual(emitted,native);
      }
    }
  }
  console.log('WASM_NUMBER_COERCION_CONTRACT_BOUNDARY '+JSON.stringify(rows));
  assert.equal(rows.length,18);
  assert.ok(rows.every(row=>row.sourceExact&&row.wasmFunctions===1));
});
