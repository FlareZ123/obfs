'use strict';

const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const {staticLiftFusedArx}=require('./fused-arx-static-lift');

/** @typedef {{kind:unknown,payload:unknown}} InputRecord */
/** @typedef {{serial:number,codeUnits:number,words:number[]}} Observation */

/**
 * Recover functional behavior from the published Wasm bytes and public
 * client state/callback contract. No compiler, native kernel, or WebAssembly
 * runtime is required. This parser is intentionally tailored to the frozen
 * ESM artifact; it is not a generic WebAssembly decompiler.
 *
 * @param {string} publishedKernelPath
 * @returns {{wasmSha256:string,wasmBytes:number,instructions:number,
 *   runScenario:(seed:number,records:InputRecord[],host?:{emit:(record:Observation)=>void})=>string}}
 */
function liftStatefulArxApp(publishedKernelPath){
  const text=readFileSync(publishedKernelPath,'utf8');
  const match=/const publicHex='([0-9a-f]+)'/u.exec(text);
  if(!match)throw new Error('Frozen published Wasm source representation changed');
  const bytes=Uint8Array.from(Buffer.from(match[1],'hex'));
  const wasmSha256=createHash('sha256').update(bytes).digest('hex');
  if(wasmSha256!=='820810c29949179df5e2cc2d7246b15efe1267fe898390703fc77e3df4f9a96f')
    throw new Error('Unexpected public candidate bytes');
  const lifted=staticLiftFusedArx(bytes);
  /**
   * @param {number} seed
   * @param {InputRecord[]} records
   * @param {{emit:(record:Observation)=>void}} [host]
   * @returns {string}
   */
  function runScenario(seed,records,host){
    const words=new Uint32Array(4);
    words[0]=seed>>>0;
    words[1]=(seed^0x243f6a88)>>>0;
    words[2]=(Math.imul(seed|0,0x85ebca6b)+0x13198a2e)>>>0;
    words[3]=((seed>>>1)^0x03707344)>>>0;
    let serial=0,codeUnits=0;
    /** @type {Observation[]} */
    const output=[];
    /** @type {Observation[]} */
    const trace=[];
    for(const record of records){
      const message=String(record.kind)+':'+String(record.payload);
      const units=Uint16Array.from({length:message.length},
        (_,index)=>message.charCodeAt(index));
      const next=lifted.run(Array.from(words),units,codeUnits);
      for(let index=0;index<4;index++)words[index]=next[index]>>>0;
      codeUnits+=message.length;
      serial++;
      const event={serial,codeUnits,words:Array.from(words)};
      output.push(event);trace.push(event);
      if(host)host.emit(event);
    }
    return JSON.stringify({output,snapshot:{serial,codeUnits,words:Array.from(words)},trace});
  }
  return {wasmSha256,wasmBytes:bytes.byteLength,
    instructions:lifted.instructions.length,runScenario};
}
module.exports={liftStatefulArxApp};
