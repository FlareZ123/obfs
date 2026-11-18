'use strict';

/**
 * Research-only fused ARX bytecode pilot. This is a fixed four-word i32
 * transition, not a general JS-to-Wasm compiler or a cryptographic primitive.
 * Every emitted byte remains public and extractable in COO/SNO.
 *
 * Binary format and memory ABI: WebAssembly Core Specification, sections
 * type/function/memory/export/code. Input is a Uint16Array of JS code units,
 * copied to linear memory starting at byte offset 16. The four final signed
 * i32 state words are stored at byte offsets 0,4,8,12.
 */

/** @param {number} value @returns {number[]} */
function uleb(value) {
  /** @type {number[]} */
  const bytes=[];
  do {
    let item=value&127;
    value=Math.floor(value/128);
    if(value)item|=128;
    bytes.push(item);
  }while(value);
  return bytes;
}

/** @param {number} value @returns {number[]} */
function sleb(value) {
  /** @type {number[]} */
  const bytes=[];
  let next=value|0;
  for(;;){
    const item=next&127;
    next>>=7;
    const done=(next===0 && (item&64)===0)||(next===-1 && (item&64)!==0);
    bytes.push(done?item:item|128);
    if(done)return bytes;
  }
}

/** @param {number[]} bytes @returns {number[]} */
function sized(bytes) {return [...uleb(bytes.length),...bytes];}

/** @param {string} name @returns {number[]} */
function utf8(name) {
  const bytes=[...Buffer.from(name,'utf8')];
  return [...uleb(bytes.length),...bytes];
}

/** @returns {Uint8Array} */
function buildArxModuleBytes() {
  /** @type {number[]} */
  const body=[];
  /** @param {number} index */
  const get=index=>body.push(0x20,index);
  /** @param {number} index */
  const set=index=>body.push(0x21,index);
  /** @param {number} value */
  const number=value=>body.push(0x41,...sleb(value));
  /** @param {number} opcode */
  const op=opcode=>body.push(opcode);
  const add=()=>op(0x6a),multiply=()=>op(0x6c);
  const xor=()=>op(0x73),or=()=>op(0x72);
  const shiftLeft=()=>op(0x74),shiftRightUnsigned=()=>op(0x76);

  // Parameters: a,b,c,d,inputPointer,length. Locals 6 and 7: index, unit.
  number(0);set(6);
  op(0x02);op(0x40);op(0x03);op(0x40);
  get(6);get(5);op(0x4f);op(0x0d);op(1);
  get(4);get(6);number(1);shiftLeft();add();
  op(0x2f);op(1);op(0);set(7);
  // a = (a + imul(b ^ c ^ unit, 0x9e3779b1)) | 0
  get(0);get(1);get(2);xor();get(7);xor();
  number(0x9e3779b1|0);multiply();add();set(0);
  // b = (b ^ rotl(c,7)) | 0
  get(1);get(2);number(7);shiftLeft();
  get(2);number(25);shiftRightUnsigned();or();xor();set(1);
  // c = (c + imul(d ^ a, 0x85ebca6b)) | 0
  get(2);get(3);get(0);xor();number(0x85ebca6b|0);
  multiply();add();set(2);
  // d = (d ^ rotl(a,13) ^ unit) | 0
  get(3);get(0);number(13);shiftLeft();
  get(0);number(19);shiftRightUnsigned();or();xor();
  get(7);xor();set(3);
  get(6);number(1);add();set(6);op(0x0c);op(0);
  op(0x0b);op(0x0b);
  for(let index=0;index<4;index++){
    number(index*4);get(index);op(0x36);op(2);op(0);
  }
  op(0x0b);

  const type=[1,0x60,6,...Array(6).fill(0x7f),0];
  const func=[1,0];
  const memory=[1,0,1];
  const exported=[2,...utf8('mix'),0,0,...utf8('memory'),2,0];
  const code=[1,...sized([1,2,0x7f,...body])];
  return Uint8Array.from([0,97,115,109,1,0,0,0,
    1,...sized(type),3,...sized(func),5,...sized(memory),
    7,...sized(exported),10,...sized(code)]);
}

/**
 * Source reference for the experimental pure fixed-word transition.
 * All input states must contain signed primitive Int32 values.
 * @param {number[]} state
 * @param {Uint16Array} units
 * @returns {number[]}
 */
function nativeMix(state,units) {
  let [a,b,c,d]=state;
  for(const unit of units){
    a=(a+Math.imul((b^c^unit)|0,0x9e3779b1))|0;
    b=(b^((c<<7)|(c>>>25)))|0;
    c=(c+Math.imul(d^a,0x85ebca6b))|0;
    d=(d^((a<<13)|(a>>>19))^unit)|0;
  }
  return [a,b,c,d];
}

/**
 * A single JS/Wasm call processes the whole buffer and preserves four
 * state words. Memory growth invalidates old DataView buffers.
 * @param {Uint8Array} [bytes]
 * @returns {{mix:(state:number[],units:Uint16Array)=>number[],bytes:Uint8Array,memory:WebAssembly.Memory}}
 */
function createFusedArxKernel(bytes=buildArxModuleBytes()) {
  const module=new WebAssembly.Module(bytes);
  const instance=new WebAssembly.Instance(module);
  const fn=/** @type {(a:number,b:number,c:number,d:number,pointer:number,length:number)=>void} */(
    /** @type {unknown} */(instance.exports.mix));
  const memory=/** @type {WebAssembly.Memory} */(
    /** @type {unknown} */(instance.exports.memory));
  let view=new DataView(memory.buffer);
  /** @param {number[]} state @param {Uint16Array} units @returns {number[]} */
  function mix(state,units) {
    const needed=16+units.length*2;
    if(needed>memory.buffer.byteLength){
      memory.grow(Math.ceil((needed-memory.buffer.byteLength)/65536));
      view=new DataView(memory.buffer);
    }
    for(let index=0;index<units.length;index++)
      view.setUint16(16+index*2,units[index],true);
    fn(state[0],state[1],state[2],state[3],16,units.length);
    return [view.getInt32(0,true),view.getInt32(4,true),
      view.getInt32(8,true),view.getInt32(12,true)];
  }
  return {mix,bytes,memory};
}

module.exports={buildArxModuleBytes,nativeMix,createFusedArxKernel};
