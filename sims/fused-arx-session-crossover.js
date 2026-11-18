'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {buildArxModuleBytes,nativeMix,createFusedArxKernel}=
  require('./fused-arx-batch');

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * A bounded same-process paired session-curve probe. Unlike a warm-only
 * benchmark, every candidate session constructs a new WebAssembly.Module and
 * Instance before its first call. The byte compiler is a build step, excluded
 * equally from both arms. The process itself is already started and V8 may
 * cache compilation of identical Wasm bytes between sessions, so this is not
 * a fresh-browser/fresh-process or full application admission result.
 *
 * @returns {{mode:string,node:string,v8:string,rows:{units:number,calls:number,
 *   nativeMs:number[],wasmMs:number[],ratioOfMedians:number,
 *   pairedOver2_5:number}[]}}
 */
function experiment(){
  const bytes=buildArxModuleBytes();
  const seed=[1,-2147483648,0x7fffffff,-13];
  /** @type {{units:number,calls:number,nativeMs:number[],wasmMs:number[],
   * ratioOfMedians:number,pairedOver2_5:number}[]} */
  const rows=[];
  for(const size of [16,128,2048]){
    const units=Uint16Array.from({length:size},(_,i)=>(i*107+55296)&65535);
    const expected=nativeMix(seed,units);
    for(const calls of [1,8,64,512,2048]){
      /** @type {number[]} */ const nativeMs=[];
      /** @type {number[]} */ const wasmMs=[];
      /** @param {'native'|'wasm'} arm @returns {number} */
      function run(arm){
        const start=performance.now();
        const kernel=arm==='wasm'?createFusedArxKernel(bytes):null;
        let checksum=0;
        for(let i=0;i<calls;i++){
          const state=arm==='native'?nativeMix(seed,units):
            /** @type {NonNullable<typeof kernel>} */(kernel).mix(seed,units);
          checksum^=state[0];
        }
        const elapsed=performance.now()-start;
        assert.equal(checksum,(calls%2?expected[0]:0),
          'The same result must be consumed by each arm');
        assert.ok(elapsed>0,'A monotonic runtime sample must be positive');
        return elapsed;
      }
      for(let trial=0;trial<11;trial++){
        const order=trial%2?['wasm','native']:['native','wasm'];
        for(const arm of order){
          if(arm==='native')nativeMs.push(run('native'));
          else wasmMs.push(run('wasm'));
        }
      }
      const ratioOfMedians=median(wasmMs)/median(nativeMs);
      const pairedOver2_5=wasmMs.filter((t,i)=>t/nativeMs[i]>2.5).length;
      rows.push({units:size,calls,nativeMs,wasmMs,ratioOfMedians,pairedOver2_5});
    }
  }
  return {mode:'same-process fresh Wasm instance each session',
    node:process.version,v8:process.versions.v8,rows};
}

if(require.main===module)console.log('FUSED_ARX_SESSION_CURVE '+JSON.stringify(experiment()));
module.exports={experiment};
