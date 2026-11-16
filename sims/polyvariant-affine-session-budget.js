'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {lowerPolyvariantAffine}=require('../src');

/** @param {number[]} values @returns {number} */
function median(values) {
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * Compile, instantiate and execute a complete short-to-long invocation
 * session. Add unique comment tags to discourage exact-source code-cache
 * reuse. Unlike an isolated hot loop, this deliberately includes the
 * construction cost, which COO cannot deduct.
 *
 * @param {string} source
 * @param {number} calls
 * @param {string} nonce
 * @returns {{elapsedMs:number,checksum:number}}
 */
function session(source,calls,nonce) {
  const start=performance.now();
  /** @type {{exports:(input:number)=>number}} */
  const module={exports:x=>x};
  Function('module','exports',source+'\n//session-'+nonce)(module,module.exports);
  const fn=module.exports;
  let checksum=0;
  for(let i=0;i<calls;i++) {
    const input=(Math.imul(i,1664525)^0x3acbaeda)|0;
    checksum=(Math.imul(checksum^fn(input),33)+i)|0;
  }
  return {elapsedMs:performance.now()-start,checksum};
}

/**
 * @param {string} original
 * @param {string} transformed
 * @param {number} calls
 * @param {number} variants
 * @returns {{nativeMs:number,protectedMs:number,ratio:number}}
 */
function paired(original,transformed,calls,variants) {
  const nativeTrials=[],protectedTrials=[];
  for(let batch=0;batch<11;batch++) {
    const entries=batch%2===0?['native','protected']:['protected','native'];
    /** @type {number|null} */
    let expected=null;
    for(const which of entries) {
      const source=which==='native'?original:transformed;
      const result=session(source,calls,variants+'-'+calls+'-'+batch+'-'+which);
      if(expected!==null)assert.equal(result.checksum,expected);
      else expected=result.checksum;
      (which==='native'?nativeTrials:protectedTrials).push(result.elapsedMs);
    }
  }
  const nativeMs=median(nativeTrials),protectedMs=median(protectedTrials);
  return {nativeMs,protectedMs,ratio:protectedMs/nativeMs};
}

/** @returns {void} */
function main() {
  const original=fs.readFileSync(path.join(__dirname,
    '../examples/polyvariant-affine/original.cjs'),'utf8').replace(/\r\n/g,'\n');
  /** @type {{variants:number,calls:number,nativeMs:number,protectedMs:number,ratio:number}[]} */
  const results=[];
  for(const variants of [2,4,8]) {
    const output=lowerPolyvariantAffine(original,'commonjs',{
      seed:'coo-session-2026-11-16',names:['guardedTotal'],
      variants:/** @type {2|4|8} */ (variants)
    });
    assert.equal(output.functions,1);
    for(const calls of [1,16,256,4096,65536,250000]) {
      const measurement=paired(original,output.code,calls,variants);
      results.push({variants,calls,...measurement});
    }
  }
  process.stdout.write(JSON.stringify({
    node:process.version,platform:process.platform,
    method:'11 alternating source-distinct full Function compile/instantiate/invoke sessions per variant/call count',
    results
  },null,2)+'\n');
}
main();
