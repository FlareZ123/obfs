'use strict';

/**
 * Output files may supply binary-compatible ASCII Wasm as a string. They are
 * written as UTF-8 bytes, so parse that exact emitted representation.
 * @param {string|Buffer} code
 * @returns {Buffer|null}
 */
function asWasmBytes(code) {
  if(Buffer.isBuffer(code))return code;
  return code.startsWith('\0asm')?Buffer.from(code,'utf8'):null;
}

/**
 * Decode the bounded unsigned 32-bit LEB128 size used by the Wasm binary
 * format. The supplied limit is the end of the current enclosing section.
 * @param {Buffer} bytes
 * @param {number} start
 * @param {number} limit
 * @returns {{value:number,next:number}}
 */
function readU32(bytes,start,limit) {
  let value=0,weight=1;
  for(let offset=start,count=0;count<5;count++,weight*=128) {
    if(offset>=limit)throw new TypeError('Truncated Wasm custom section length');
    const byte=bytes[offset++];
    if(count===4&&(byte&0xf0)!==0)throw new TypeError('Out-of-range Wasm section length');
    value+=(byte&127)*weight;
    if((byte&128)===0)return {value,next:offset};
  }
  throw new TypeError('Overlong Wasm section length');
}

/**
 * Debug metadata custom sections can publish original function/local names
 * and source-file references while leaving the executable module unchanged.
 * Read the *section names*, rather than searching payload bytes for marker
 * strings, so an ordinary data section containing such strings stays safe.
 *
 * Callers validate a recognized Wasm module with WebAssembly.Module first.
 * A direct call also validates every custom-section boundary encountered.
 * This intentionally screens named debug conventions, not arbitrary opaque
 * third-party custom sections that could also carry original source data.
 *
 * @param {string|Buffer} code
 * @returns {boolean}
 */
function hasWasmDebugMetadata(code) {
  const bytes=asWasmBytes(code);
  if(!bytes||bytes.length<8||
      bytes[0]!==0||bytes[1]!==0x61||bytes[2]!==0x73||bytes[3]!==0x6d)return false;

  const decoder=new TextDecoder('utf-8',{fatal:true});
  for(let offset=8;offset<bytes.length;) {
    const sectionId=bytes[offset++];
    const length=readU32(bytes,offset,bytes.length);
    const end=length.next+length.value;
    if(end>bytes.length)throw new TypeError('Truncated Wasm section');
    if(sectionId===0) {
      const lengthName=readU32(bytes,length.next,end);
      const endName=lengthName.next+lengthName.value;
      if(endName>end)throw new TypeError('Truncated Wasm custom section name');
      const name=decoder.decode(bytes.subarray(lengthName.next,endName));
      if(name==='name'||name==='external_debug_info'||
          name.startsWith('.debug_')||name.startsWith('.zdebug_'))return true;
    }
    offset=end;
  }
  return false;
}

module.exports={asWasmBytes,hasWasmDebugMetadata};
