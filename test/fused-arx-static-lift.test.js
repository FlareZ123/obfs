'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {buildArxModuleBytes,nativeMix}=require('../sims/fused-arx-batch');
const {staticLiftFusedArx}=require('../sims/fused-arx-static-lift');

/** @param {number} value @returns {number} */
function next(value){value^=value<<13;value^=value>>>17;value^=value<<5;return value|0;}

test('source-only lift of frozen public fused Wasm reproduces held-out states',()=>{
  const bytes=buildArxModuleBytes();
  const sha=createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha,'c2e9f1fbf85505a43681f0a09da9c0ebe9b7eeb9f067b69cd8320b703d8df88d');
  const originalWasm=globalThis.WebAssembly;
  /** @type {ReturnType<typeof staticLiftFusedArx>} */
  let attacker;
  try{
    // The attacker cannot instantiate or execute the distributed Wasm bytes.
    // Its only executable is the source-only opcode interpreter above.
    globalThis.WebAssembly=/** @type {typeof WebAssembly} */(/** @type {unknown} */(undefined));
    attacker=staticLiftFusedArx(bytes);
    let random=0x47a5516;
    for(let index=0;index<12288;index++){
      const count=index%23;
      const units=new Uint16Array(count);
      for(let i=0;i<count;i++){
        random=next(random);
        units[i]=(i%7===0?0xd800:(random>>>0))&65535;
      }
      random=next(random);
      const state=[random,next(random),next(next(random)),next(next(next(random)))];
      assert.deepEqual(attacker.run(state,units),nativeMix(state,units),
        'Source-only clone mismatch at held-out record '+index);
    }
    console.log('FUSED_ARX_STATIC_LIFT '+JSON.stringify({
      wasmSha256:sha,heldOutRecords:12288,
      decodedInstructions:attacker.instructions.length,
      attackMethod:'parse published Wasm code and replay in JavaScript; no WebAssembly API',
      scope:'fixed import-free pilot only; not integrated three-file obfuscator candidate'
    }));
  }finally{globalThis.WebAssembly=originalWasm;}
});
