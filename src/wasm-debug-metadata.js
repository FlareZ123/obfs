'use strict';

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
  if(!Buffer.isBuffer(code)||code.length<8||
      code[0]!==0||code[1]!==0x61||code[2]!==0x73||code[3]!==0x6d)return false;

  const decoder=new TextDecoder('utf-8',{fatal:true});
  for(let offset=8;offset<code.length;) {
    const sectionId=code[offset++];
    const length=readU32(code,offset,code.length);
    const end=length.next+length.value;
    if(end>code.length)throw new TypeError('Truncated Wasm section');
    if(sectionId===0) {
      const lengthName=readU32(code,length.next,end);
      const endName=lengthName.next+lengthName.value;
      if(endName>end)throw new TypeError('Truncated Wasm custom section name');
      const name=decoder.decode(code.subarray(lengthName.next,endName));
      if(name==='name'||name==='external_debug_info'||
          name.startsWith('.debug_')||name.startsWith('.zdebug_'))return true;
    }
    offset=end;
  }
  return false;
}

module.exports={hasWasmDebugMetadata};
