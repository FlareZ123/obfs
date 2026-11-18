'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {buildArxModuleBytes,nativeMix,createFusedArxKernel}=
  require('../sims/fused-arx-batch');
const {installWasmCapture}=require('../sims/wasm-runtime-capture');
const {replayCapturedFusedArx}=require('../sims/fused-arx-runtime-clone');

const expectedSha='c2e9f1fbf85505a43681f0a09da9c0ebe9b7eeb9f067b69cd8320b703d8df88d';

/** @param {number} value @returns {number} */
function next(value){value^=value<<13;value^=value>>>17;value^=value<<5;return value|0;}

test('independent runtime byte capture and seeded ARX Wasm clone match native',()=>{
  const bytes=buildArxModuleBytes();
  const digest=createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest,expectedSha,'Frozen ARX pilot bytecode changed');
  const capture=installWasmCapture();
  /** @type {ReturnType<typeof createFusedArxKernel>|undefined} */
  let original;
  try {
    original=createFusedArxKernel(bytes);
    assert.deepEqual(original.mix([1,2,3,4],Uint16Array.from([0,65,65535,0xd800])),
      nativeMix([1,2,3,4],Uint16Array.from([0,65,65535,0xd800])));
    capture.snapshot();
  } finally {capture.restore();}
  assert.ok(original);
  const binary=capture.binaries.filter(item=>item.sha256===digest);
  assert.equal(binary.length,1,'Capture must observe exactly one target module');
  assert.equal(binary[0].operation,'Module');
  const attack=replayCapturedFusedArx(capture,digest);
  assert.notEqual(attack.memory,original.memory,
    'Attacker must instantiate a new independent module');
  assert.deepEqual(Buffer.from(attack.bytes),Buffer.from(bytes),
    'Captured bytes must be the exact published module');
  assert.equal(capture.memoryDumps.length,1);
  assert.deepEqual(capture.instances[0].exports,['mix','memory']);
  let random=0x128acad,comparisons=0;
  for(const count of [0,1,2,7,128,1024,8192,12288,65536,102400]){
    const units=Uint16Array.from({length:count},(_,index)=>
      (index*271+(index%13===0?55296:65535))&65535);
    for(let trial=0;trial<8;trial++){
      random=next(random);
      const seed=[random,next(random),next(next(random)),next(next(next(random)))];
      const native=nativeMix(seed,units);
      const observed=original.mix(seed,units);
      const replay=attack.run(seed,units);
      assert.deepEqual(observed,native,'Original/native size='+count+'/trial='+trial);
      assert.deepEqual(replay,native,'Clone/native size='+count+'/trial='+trial);
      comparisons+=4;
    }
  }
  console.log('FUSED_ARX_INDEPENDENT_RUNTIME_CLONE '+JSON.stringify({
    wasmSha256:digest,capturedBytes:binary[0].byteLength,
    memorySnapshots:capture.memoryDumps.length,
    nativeStateWordComparisons:comparisons,
    exportedSymbols:capture.instances[0].exports,
    execution:'independent WebAssembly.Module from preloaded runtime-captured bytes',
    limitation:'fixed stand-alone ARX kernel, known public ABI, no three-file app or equal-trust minifier comparison'
  }));
});
