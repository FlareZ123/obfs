'use strict';

/**
 * Fixed-source experimental Wasm batch lowerer for the checked-in stateful
 * ARX reference. This admits one known pure transition, not arbitrary JS.
 * No runtime secrecy: all generated instructions and state remain public.
 */

/** @param {number} value @returns {number[]} */
function uleb(value){const bytes=[];do{let byte=value&127;value=Math.floor(value/128);if(value)byte|=128;bytes.push(byte);}while(value);return bytes;}
/** @param {number} value @returns {number[]} */
function sleb(value){const bytes=[];let rest=value|0;for(;;){const byte=rest&127;rest>>=7;const done=(rest===0&&!(byte&64))||(rest===-1&&!!(byte&64));bytes.push(done?byte:byte|128);if(done)return bytes;}}
/** @param {number[]} bytes @returns {number[]} */
function sized(bytes){return [...uleb(bytes.length),...bytes];}
/** @param {string} name @returns {number[]} */
function text(name){const bytes=[...Buffer.from(name,'utf8')];return [...uleb(bytes.length),...bytes];}

/**
 * Lower a fixed six-operation intermediate computation into a single i32
 * batch loop. The transition exactly mirrors the 18-Nov native kernel:
 * 4 state words, UTF-16 input, serial-dependent ARX, no host calls inside.
 *
 * @returns {Uint8Array} Public binary.
 */
function buildStatefulArxWasm(){
  /** @type {number[]} */ const body=[];
  /** @param {number} index */ const get=index=>body.push(0x20,...uleb(index));
  /** @param {number} index */ const set=index=>body.push(0x21,...uleb(index));
  /** @param {number} value */ const i32=value=>body.push(0x41,...sleb(value));
  /** @param {number} opcode */ const op=opcode=>body.push(opcode);
  // Params 0..6: state a,b,c,d, pointer, length, serialStart.
  // Locals 7..13: codeUnitIndex, codeUnit, key, partial a,b,c,d.
  i32(0);set(7);
  op(0x02);op(0x40);op(0x03);op(0x40);
  get(7);get(5);op(0x4f);op(0x0d);op(1);
  get(4);get(7);i32(1);op(0x74);op(0x6a);op(0x2f);op(1);op(0);set(8);
  // key = codeUnit ^ imul(serialStart + index + 1, 0x9e3779b9).
  get(8);get(6);get(7);op(0x6a);i32(1);op(0x6a);
  i32(0x9e3779b9|0);op(0x6c);op(0x73);set(9);
  // a = old.a + old.b + key.
  get(0);get(1);op(0x6a);get(9);op(0x6a);set(10);
  // b = old.b ^ rotl(old.c, 7).
  get(1);get(2);i32(7);op(0x77);op(0x73);set(11);
  // c = old.c + rotl(old.d, 11) + key.
  get(2);get(3);i32(11);op(0x77);op(0x6a);get(9);op(0x6a);set(12);
  // d = old.d ^ rotl(a, 16).
  get(3);get(10);i32(16);op(0x77);op(0x73);set(13);
  get(10);get(11);i32(5);op(0x77);op(0x73);set(0);
  get(11);get(12);i32(9);op(0x77);op(0x6a);set(1);
  get(12);get(13);i32(13);op(0x77);op(0x73);set(2);
  get(13);get(10);i32(21);op(0x77);op(0x6a);set(3);
  get(7);i32(1);op(0x6a);set(7);op(0x0c);op(0);
  op(0x0b);op(0x0b);
  for(let index=0;index<4;index++){
    i32(index*4);get(index);op(0x36);op(2);op(0);
  }
  op(0x0b);
  const type=[1,0x60,7,...Array(7).fill(0x7f),0];
  const code=[1,...sized([1,7,0x7f,...body])];
  const exported=[2,...text('mix'),0,0,...text('memory'),2,0];
  return Uint8Array.from([0,97,115,109,1,0,0,0,
    1,...sized(type),3,...sized([1,0]),5,...sized([1,0,1]),
    7,...sized(exported),10,...sized(code)]);
}
module.exports={buildStatefulArxWasm};
