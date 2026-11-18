'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {installWasmCapture}=require('../sims/wasm-runtime-capture');
const {nativeMix,createFusedArxKernel}=require('../sims/fused-arx-batch');

const targetHash='c2e9f1fbf85505a43681f0a09da9c0ebe9b7eeb9f067b69cd8320b703d8df88d';

/**
 * A standalone public-bytecode attacker: accepts only the bytes obtained
 * from the host preloader and the observable public exported ABI.
 * It does not import the protected Wasm generator or its JS wrapper.
 * @param {Buffer} bytes
 * @param {number[]} seed
 * @param {Uint16Array} units
 * @returns {number[]}
 */
function recoveredPublicKernel(bytes,seed,units) {
  const source=new ArrayBuffer(bytes.byteLength);
  new Uint8Array(source).set(bytes);
  const instance=new WebAssembly.Instance(new WebAssembly.Module(source));
  const memory=/** @type {WebAssembly.Memory} */(
    /** @type {unknown} */(instance.exports.memory));
  const call=/** @type {(a:number,b:number,c:number,d:number,p:number,n:number)=>void} */(
    /** @type {unknown} */(instance.exports.mix));
  const capacity=16+units.length*2;
  if(capacity>memory.buffer.byteLength)
    memory.grow(Math.ceil((capacity-memory.buffer.byteLength)/65536));
  const view=new DataView(memory.buffer);
  for(let index=0;index<units.length;index++)
    view.setUint16(16+index*2,units[index],true);
  call(seed[0],seed[1],seed[2],seed[3],16,units.length);
  return [view.getInt32(0,true),view.getInt32(4,true),
    view.getInt32(8,true),view.getInt32(12,true)];
}

test('independent attacker preload extracts actual executed fused Wasm and clones it',()=>{
  const original=WebAssembly;
  const capture=installWasmCapture();
  const seed=[0x7fffffff,0x80000000|0,-17,0xabcdefff|0];
  const units=Uint16Array.from({length:32771},(_,index)=>index*187);
  /** @type {number[]} */
  let actual=[];
  try {
    const candidate=createFusedArxKernel();
    actual=candidate.mix(seed,units);
    assert.deepEqual(actual,nativeMix(seed,units));
    const targetEvents=capture.binaries.filter(item=>item.sha256===targetHash);
    assert.equal(targetEvents.length,1,'Expected one genuine executed Wasm module');
    assert.equal(targetEvents[0].operation,'Module');
    assert.ok(capture.instances.some(instance=>
      instance.exports.includes('mix')&&instance.exports.includes('memory')));
    const snapshots=capture.snapshot();
    assert.ok(snapshots.length>0);
    assert.ok(snapshots.some(item=>item.byteLength>=131072),
      'Full memory must reflect real block-triggered Wasm growth');
  }finally{
    capture.restore();
  }
  assert.equal(WebAssembly,original,
    'Attacker preload cleanup must leave platform constructors unchanged');
  const publicBytes=capture.sourceBytes.get(targetHash);
  assert.ok(publicBytes,'Actual executable bytecode must be in captured host source');
  assert.equal(createHash('sha256').update(publicBytes).digest('hex'),targetHash);
  assert.deepEqual(recoveredPublicKernel(publicBytes,seed,units),actual,
    'Independent runtime extraction replays complete original behavior');
  console.log('FUSED_ARX_PRELOADER_CLONE '+JSON.stringify({
    sha256:targetHash,sourceBytes:publicBytes.length,bytesObserved:capture.binaries.length,
    targetModuleOccurrences:capture.binaries.filter(x=>x.sha256===targetHash).length,
    instances:capture.instances.length,snapshots:capture.memories.length,
    matchedWords:4,codeUnits:units.length
  }));
});
