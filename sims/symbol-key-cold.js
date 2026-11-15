'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');

/**
 * Generate a privately owned object workload with independently named fields.
 * The local proof must rename every private key for this benchmark to be
 * representative of the requested experimental backend.
 * @param {number} count
 * @returns {string}
 */
function sourceFor(count) {
  let source="'use strict';\n";
  for(let i=0;i<count;i++)source+=
    'const bag'+i+'={pulse'+i+':'+(i+1)+',mask'+i+':'+((i*7)&255)+'};\n';
  source+='module.exports=function compute(x){let sum=0;';
  for(let i=0;i<count;i++)source+=
    'bag'+i+'.pulse'+i+'+=x;sum+=(bag'+i+'.pulse'+i+'^bag'+i+'.mask'+i+');';
  return source+'return sum;};\n';
}

/**
 * Include native code creation, module evaluation and optionally warm calls.
 * This compares repeated fresh dynamic compilation as a startup surrogate,
 * not full browser page/network loading or fresh-process startup.
 *
 * @param {string} source
 * @param {number} calls
 * @returns {{milliseconds:number,checksum:number}}
 */
function runCold(source,calls) {
  const start=performance.now();
  const module=/** @type {{exports:unknown}} */ ({exports:null});
  new Function('module','exports',source)(module,module.exports);
  const compute=/** @type {(n:number)=>number} */ (module.exports);
  let checksum=0;
  for(let i=0;i<calls;i++)checksum^=compute(i&15);
  return {milliseconds:performance.now()-start,checksum};
}

/** @param {number[]} values @returns {number} */
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];

/**
 * @param {string} native
 * @param {string} symbol
 * @param {number} calls
 * @returns {{native:number,symbol:number,ratio:number,checksum:number}}
 */
function measure(native,symbol,calls) {
  // The setup phase primes only runtime code caches; it cannot be deducted
  // from the measured COO browser startup contract.
  for(let i=0;i<20;i++){runCold(native,calls);runCold(symbol,calls);}
  /** @type {number[]} */
  const a=[],b=[];
  let checksum=0;
  for(let i=0;i<101;i++) {
    if(i&1) {
      const transformed=runCold(symbol,calls);
      const original=runCold(native,calls);
      assert.equal(transformed.checksum,original.checksum);
      b.push(transformed.milliseconds);
      a.push(original.milliseconds);
      checksum^=original.checksum;
    }else{
      const original=runCold(native,calls);
      const transformed=runCold(symbol,calls);
      assert.equal(transformed.checksum,original.checksum);
      a.push(original.milliseconds);
      b.push(transformed.milliseconds);
      checksum^=original.checksum;
    }
  }
  return {native:median(a),symbol:median(b),ratio:median(b)/median(a),checksum};
}

const results=[];
for(const count of [1,10,50]) {
  const native=sourceFor(count);
  const output=obfuscateFiles([
    {path:'cold.cjs',code:native,sourceType:'commonjs'}
  ],{mode:'coo',seed:'symbol-cold-'+count,strings:false,
    identifiers:false,experimentalSymbolKeys:true});
  const transformed=/** @type {string} */ (output.files[0].code);
  assert.equal(output.files[0].metrics.symbolKeys,count*2);
  for(const calls of [0,1,100,10000]) {
    const benchmark=measure(native,transformed,calls);
    results.push({objects:count,calls,originalBytes:Buffer.byteLength(native),
      symbolBytes:Buffer.byteLength(transformed),...benchmark});
  }
}
process.stdout.write(JSON.stringify({platform:process.platform,node:process.version,
  trials:101,results},null,2)+'\n');
