'use strict';

const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');

/** @typedef {{entry:string,state:string,kernel:string}} NativeGraph */
/** @typedef {{entry:string,state:string,kernel:string,wasmSha256:string}} FusedGraph */

const expected=Object.freeze({
  entry:'9b67b584d7ed8ffba74f6bc33d2ce69bc83695f61585a28246349007517d898a',
  state:'20f89acb9088de2be0a19d94d377a842d3ed3251e677dce06f3a1242a4b2e775',
  kernel:'1f4fad3c82ef9713110b6565c0d15622e48c64a6befeea0d4980b126b2cb4b75'
});

const nativeLoop=[
  '      for(let index=0;index<message.length;index++){',
  '        advance(words,message.charCodeAt(index),codeUnits);',
  '        codeUnits++;',
  '      }'
].join('\n');

/** @param {string} value @returns {string} */
function sha256(value){return createHash('sha256').update(value).digest('hex');}

/**
 * Fuse exactly the reviewed stateful ARX graph. Any source-byte mutation is
 * refused because this pilot does not prove general JavaScript semantics.
 * Its embedded public Wasm bytes can be copied or reverse engineered.
 * @param {NativeGraph} native
 * @returns {FusedGraph}
 */
function fuseStatefulArxGraph(native){
  for(const key of /** @type {(keyof NativeGraph)[]} */(['entry','state','kernel'])){
    if(typeof native[key]!=='string'||sha256(native[key])!==expected[key]){
      throw new TypeError('Unproved source graph: '+key);
    }
  }
  if(!native.state.includes(nativeLoop))throw new Error('Native loop proof mismatch');
  const hex=readFileSync(path.join(__dirname,'stateful-arx-wasm-264.hex'),'utf8').trim();
  if(!/^[a-f0-9]{528}$/u.test(hex))throw new TypeError('Invalid frozen Wasm fixture');
  const bytes=Uint8Array.from(Buffer.from(hex,'hex'));
  const wasmSha256=createHash('sha256').update(bytes).digest('hex');
  if(wasmSha256!=='6feb78b5360ad0299cbcdbd5b6dbafb0aa26ce5c3efe3eaaab717da3d8810ebb'){
    throw new Error('Frozen binary hash mismatch');
  }
  const state=native.state
    .replace("import {advance} from './kernel.mjs';",
      "import {advanceBatch} from './kernel.mjs';")
    .replace(nativeLoop,
      '      advanceBatch(words,message,codeUnits);\n      codeUnits+=message.length;');
  const kernel=[
    "'use strict';",
    '',
    '// Research-only public, fixed-source ARX fusion. All bytes are extractable.',
    'const bytes=Uint8Array.from('+JSON.stringify(Array.from(bytes))+');',
    '/** @type {((a:number,b:number,c:number,d:number,ptr:number,len:number,serial:number)=>void)|undefined} */',
    'let mix;',
    '/** @type {WebAssembly.Memory|undefined} */',
    'let memory;',
    '/** @type {DataView|undefined} */',
    'let view;',
    '',
    '/**',
    ' * Run one whole record in WebAssembly, matching the reviewed native kernel.',
    ' * @param {Uint32Array} words',
    ' * @param {string} message',
    ' * @param {number} serial',
    ' * @returns {void}',
    ' */',
    'export function advanceBatch(words,message,serial){',
    '  if(!mix){',
    '    const instance=new WebAssembly.Instance(new WebAssembly.Module(bytes));',
    '    mix=/** @type {NonNullable<typeof mix>} */ (',
    '      /** @type {unknown} */(instance.exports.mix));',
    '    memory=/** @type {WebAssembly.Memory} */(',
    '      /** @type {unknown} */(instance.exports.memory));',
    '    view=new DataView(memory.buffer);',
    '  }',
    '  const currentMemory=/** @type {WebAssembly.Memory} */(memory);',
    '  let currentView=/** @type {DataView} */(view);',
    '  const inputPointer=0x4000;',
    '  const needed=inputPointer+message.length*2;',
    '  if(needed>currentMemory.buffer.byteLength){',
    '    currentMemory.grow(Math.ceil((needed-currentMemory.buffer.byteLength)/65536));',
    '    currentView=new DataView(currentMemory.buffer);',
    '    view=currentView;',
    '  }',
    '  for(let index=0;index<message.length;index++){',
    '    currentView.setUint16(inputPointer+2*index,message.charCodeAt(index),true);',
    '  }',
    '  mix(words[0],words[1],words[2],words[3],inputPointer,message.length,serial);',
    '  for(let index=0;index<4;index++){',
    '    words[index]=currentView.getUint32(0x400+4*index,true);',
    '  }',
    '}',
    ''
  ].join('\n');
  return {entry:native.entry,state,kernel,wasmSha256};
}

module.exports={expected,fuseStatefulArxGraph};
