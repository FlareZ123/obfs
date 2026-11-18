'use strict';

// Research-only public, fixed-source ARX fusion. All bytes are extractable.
const bytes=Uint8Array.from([0,97,115,109,1,0,0,0,1,11,1,96,7,127,127,127,127,127,127,127,0,3,2,1,0,4,5,1,112,1,1,1,5,5,1,1,1,128,2,6,8,1,127,1,65,128,224,0,11,7,16,2,6,109,101,109,111,114,121,2,0,3,109,105,120,0,0,10,194,1,1,191,1,1,2,127,2,64,2,64,32,5,13,0,32,3,33,7,32,2,33,8,12,1,11,65,185,243,221,241,121,32,6,65,199,140,162,142,6,108,107,33,6,3,64,32,0,32,1,106,32,6,32,4,47,1,0,115,34,8,106,34,7,32,1,32,2,65,7,119,115,34,1,65,5,119,115,33,0,32,2,32,3,65,11,119,106,32,8,106,34,2,65,9,119,32,1,106,33,1,32,4,65,2,106,33,4,32,6,65,185,243,221,241,121,106,33,6,32,7,65,16,119,32,3,115,34,3,65,13,119,32,2,115,34,8,33,2,32,3,32,7,65,21,119,106,34,7,33,3,32,5,65,127,106,34,5,13,0,11,11,65,0,32,0,54,2,128,8,65,0,32,1,54,2,132,8,65,0,32,8,54,2,136,8,65,0,32,7,54,2,140,8,11]);
/** @type {((a:number,b:number,c:number,d:number,ptr:number,len:number,serial:number)=>void)|undefined} */
let mix;
/** @type {WebAssembly.Memory|undefined} */
let memory;
/** @type {DataView|undefined} */
let view;

/**
 * Run one whole record in WebAssembly, matching the reviewed native kernel.
 * @param {Uint32Array} words
 * @param {string} message
 * @param {number} serial
 * @returns {void}
 */
export function advanceBatch(words,message,serial){
  if(!message.length)return;
  if(!mix){
    const instance=new WebAssembly.Instance(new WebAssembly.Module(bytes));
    mix=/** @type {NonNullable<typeof mix>} */ (
      /** @type {unknown} */(instance.exports.mix));
    memory=/** @type {WebAssembly.Memory} */(
      /** @type {unknown} */(instance.exports.memory));
    view=new DataView(memory.buffer);
  }
  const currentView=/** @type {DataView} */(view);
  const inputPointer=0x4000;
  const batchUnits=16384;
  for(let start=0;start<message.length;start+=batchUnits){
    const count=Math.min(batchUnits,message.length-start);
    for(let index=0;index<count;index++){
      currentView.setUint16(inputPointer+2*index,message.charCodeAt(start+index),true);
    }
    mix(words[0],words[1],words[2],words[3],inputPointer,count,serial+start);
    for(let index=0;index<4;index++){
      words[index]=currentView.getUint32(0x400+4*index,true);
    }
  }
}
