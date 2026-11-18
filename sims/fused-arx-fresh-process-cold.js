'use strict';

const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {buildArxModuleBytes,nativeMix,createFusedArxKernel}=
  require('./fused-arx-batch');

const expectedSha='c2e9f1fbf85505a43681f0a09da9c0ebe9b7eeb9f067b69cd8320b703d8df88d';

/** @param {number[]} samples @returns {number} */
function median(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Spawned process measures only native arithmetic or new Wasm compile,
 * instantiation and arithmetic, after both arms loaded the same JS source
 * modules and prepared equivalent Uint16Array data and static public Wasm
 * bytes. Every child has a fresh Node process and V8 isolate, rather than a
 * repeated within-process compilation cache.
 * @param {'native'|'wasm'} arm
 * @param {number} size
 * @param {number} calls
 * @returns {{ms:number,checksum:number}}
 */
function measure(arm,size,calls){
  const seed=[1,-2147483648,0x7fffffff,-13];
  const units=Uint16Array.from({length:size},(_,i)=>(i*107+55296)&65535);
  const bytes=buildArxModuleBytes();
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expectedSha);
  const before=process.hrtime.bigint();
  const kernel=arm==='wasm'?createFusedArxKernel(bytes):null;
  let checksum=0;
  for(let i=0;i<calls;i++){
    const result=arm==='native'?nativeMix(seed,units):
      /** @type {NonNullable<typeof kernel>} */(kernel).mix(seed,units);
    checksum^=result[0];
  }
  const ms=Number(process.hrtime.bigint()-before)/1e6;
  const expected=nativeMix(seed,units)[0];
  assert.equal(checksum,(calls%2?expected:0),'Child arithmetic must agree');
  assert.ok(ms>0&&Number.isFinite(ms));
  return {ms,checksum};
}

/**
 * @param {'native'|'wasm'} arm
 * @param {number} size
 * @param {number} calls
 * @returns {number}
 */
function sampleChild(arm,size,calls){
  const child=spawnSync(process.execPath,[__filename,'--child',arm,String(size),String(calls)],{
    encoding:'utf8',maxBuffer:1024*1024,windowsHide:true
  });
  assert.equal(child.status,0,'Fresh-process '+arm+' failure: '+child.stderr);
  const output=/** @type {{ms:number,checksum:number}} */(JSON.parse(child.stdout));
  assert.ok(Number.isFinite(output.ms)&&output.ms>0);
  return output.ms;
}

/**
 * Nine balanced, process-independent pairs per workload.
 * No external source-equivalence or browser-run admission is implied.
 * @returns {{node:string,v8:string,wasmSha256:string,
 * rows:{units:number,calls:number,nativeMs:number[],wasmMs:number[],
 * ratioOfMedians:number,pairedOver2_5:number}[]}}
 */
function experiment(){
  /** @type {{units:number,calls:number,nativeMs:number[],wasmMs:number[],
   * ratioOfMedians:number,pairedOver2_5:number}[]} */
  const rows=[];
  for(const size of [16,128,2048]){
    for(const calls of [1,8,64]){
      /** @type {number[]} */ const nativeMs=[];
      /** @type {number[]} */ const wasmMs=[];
      for(let trial=0;trial<9;trial++){
        const order=trial%2?['wasm','native']:['native','wasm'];
        for(const label of order){
          if(label==='native')nativeMs.push(sampleChild('native',size,calls));
          else wasmMs.push(sampleChild('wasm',size,calls));
        }
      }
      rows.push({units:size,calls,nativeMs,wasmMs,
        ratioOfMedians:median(wasmMs)/median(nativeMs),
        pairedOver2_5:wasmMs.filter((ms,index)=>ms/nativeMs[index]>2.5).length
      });
    }
  }
  return {node:process.version,v8:process.versions.v8,
    wasmSha256:expectedSha,rows};
}

if(require.main===module){
  if(process.argv[2]==='--child'){
    const arm=/** @type {'native'|'wasm'} */(process.argv[3]);
    process.stdout.write(JSON.stringify(measure(arm,Number(process.argv[4]),
      Number(process.argv[5]))));
  }else{
    console.log('FUSED_ARX_FRESH_PROCESS '+JSON.stringify(experiment()));
  }
}
module.exports={experiment,measure};
