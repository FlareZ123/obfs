'use strict';

/**
 * Byte-frozen, transparent experimental WebAssembly kernel.
 * Source: sims/stateful-arx-wasm-build.js. SHA-256 of exactly 228 public
 * bytes: 820810c29949179df5e2cc2d7246b15efe1267fe898390703fc77e3df4f9a96f.
 * This eager compilation is a COO cold-start cost.
 */
const publicHex='0061736d01000000010b0160077f7f7f7f7f7f7f00030201000503010001071002036d69780000066d656d6f727902000ab10101ae0101077f4100210702400340200720054f0d01200420074101746a2f010021082008200620076a41016a41b9f3ddf1796c732109200020016a20096a210a2001200241077773210b20022003410b776a20096a210c2003200a41107773210d200a200b410577732100200b200c4109776a2101200c200d410d77732102200d200a4115776a2103200741016a21070c000b0b410020003602004104200136020041082002360200410c20033602000b';
const publicBytes=Uint8Array.from(
  {length:publicHex.length/2},(_,index)=>parseInt(publicHex.slice(index*2,index*2+2),16));
const instance=new WebAssembly.Instance(new WebAssembly.Module(publicBytes));
const memory=/** @type {WebAssembly.Memory} */(
  /** @type {unknown} */(instance.exports.memory));
const mix=/** @type {(a:number,b:number,c:number,d:number,pointer:number,length:number,serial:number)=>void} */(
  /** @type {unknown} */(instance.exports.mix));
let view=new DataView(memory.buffer);

/**
 * Updates the exact four Uint32 state words once per record.
 * The public ABI is seven i32 parameters; linear-memory input UTF-16
 * begins at 16 and output unsigned state words occupy offsets 0..15.
 * @param {Uint32Array} words
 * @param {string} message
 * @param {number} serialStart
 * @returns {void}
 */
export function mixMessage(words,message,serialStart){
  const required=16+message.length*2;
  if(required>memory.buffer.byteLength){
    memory.grow(Math.ceil((required-memory.buffer.byteLength)/65536));
    view=new DataView(memory.buffer);
  }
  for(let index=0;index<message.length;index++)
    view.setUint16(16+index*2,message.charCodeAt(index),true);
  mix(words[0],words[1],words[2],words[3],16,message.length,serialStart);
  for(let index=0;index<4;index++)words[index]=view.getUint32(index*4,true);
}
