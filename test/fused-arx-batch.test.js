'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const {buildArxModuleBytes,nativeMix,createFusedArxKernel}=
  require('../sims/fused-arx-batch');

/** @param {number} x @returns {number} */
function next(x){x^=x<<13;x^=x>>>17;x^=x<<5;return x|0;}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @param {string} reason
 */
function equalState(a,b,reason){
  assert.deepEqual(b,a,reason);
  assert.ok(a.every(item=>(item|0)===item),reason+'/Int32');
}

test('fused four-word i32 and UTF-16 block exactly match native across memory growth',()=>{
  const bytes=buildArxModuleBytes();
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    'c2e9f1fbf85505a43681f0a09da9c0ebe9b7eeb9f067b69cd8320b703d8df88d',
    'Wasm module artifact bytes differ from pinned Node/Chromium evidence');
  const source=new ArrayBuffer(bytes.byteLength);
  new Uint8Array(source).set(bytes);
  assert.ok(WebAssembly.validate(source));
  const module=new WebAssembly.Module(source);
  assert.deepEqual(WebAssembly.Module.exports(module),[
    {name:'mix',kind:'function'},{name:'memory',kind:'memory'}
  ]);
  const kernel=createFusedArxKernel(bytes);
  const seeds=[[0,1,-1,2147483647],[0x7fffffff,0x80000000|0,123,-23],
    [-213120,131,0x56abcdef|0,0]];
  let cases=0;
  for(const count of [0,1,2,7,16,64,128,512,1024,8192,32760,65535,65536,102400]){
    const units=Uint16Array.from({length:count},(_,index)=>(index*271+index*index)|0);
    for(const seed of seeds){
      equalState(nativeMix(seed,units),kernel.mix(seed,units),'size='+count);
      cases++;
    }
  }
  let random=0x21a37;
  for(let index=0;index<512;index++){
    random=next(random);
    const count=random>>>27;
    random=next(random);
    const seed=[random,next(random),next(next(random)),next(next(next(random)))];
    const units=Uint16Array.from({length:count},(_,j)=>(j^random)|0);
    equalState(nativeMix(seed,units),kernel.mix(seed,units),'seed='+index);
    cases++;
  }
  assert.equal(cases,554);
});

test('public wasm binary is sufficient for an untrusted runtime to clone kernel',()=>{
  const bytes=buildArxModuleBytes();
  const exposed=Uint8Array.from(bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    createHash('sha256').update(exposed).digest('hex'));
  const attacker=createFusedArxKernel(exposed);
  const candidate=createFusedArxKernel(bytes);
  assert.notEqual(attacker.memory,candidate.memory);
  const seed=[0x12345,-2147483648,17,0x7fffffff];
  const inputs=Uint16Array.from({length:8192},(_,index)=>index*109);
  equalState(candidate.mix(seed,inputs),attacker.mix(seed,inputs),
    'A full copied public module executes without original source');
  equalState(nativeMix(seed,inputs),attacker.mix(seed,inputs),
    'The cloned public binary reproduces all selected semantics');
});

test('bounded warm-only real-clock profile records native and Wasm separately',()=>{
  const kernel=createFusedArxKernel();
  const seed=[1,2,3,4];
  /** @type {{units:number, native:number[],wasm:number[],ratio:number}[]} */
  const rows=[];
  for(const count of [16,128,2048]) {
    const units=Uint16Array.from({length:count},(_,index)=>index*101);
    /** @param {(s:number[],input:Uint16Array)=>number[]} fn */
    function work(fn) {
      let check=0;
      const start=performance.now();
      for(let index=0;index<2500;index++)check^=fn(seed,units)[0];
      const ms=performance.now()-start;
      assert.equal(check,0,'Repeated identical outputs must cancel');
      assert.ok(ms>0);
      return ms;
    }
    for(let warmup=0;warmup<2;warmup++){
      work(nativeMix);
      work(kernel.mix);
    }
    /** @type {number[]} */ const native=[];
    /** @type {number[]} */ const wasm=[];
    for(let trial=0;trial<8;trial++){
      for(const label of (trial%2?['wasm','native']:['native','wasm'])) {
        if(label==='wasm')wasm.push(work(kernel.mix));
        else native.push(work(nativeMix));
      }
    }
    const median=/** @param {number[]} items */(items)=>
      [...items].sort((a,b)=>a-b)[Math.floor(items.length/2)];
    rows.push({units:count,native,wasm,ratio:median(wasm)/median(native)});
  }
  console.log('FUSED_ARX_WARM_ONLY '+JSON.stringify({
    limitation:'fixed local kernel, no startup, JS string conversion, browser or attacker time',
    node:process.version,v8:process.versions.v8,rows
  }));
});
