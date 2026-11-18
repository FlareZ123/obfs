'use strict';

const {createHash}=require('node:crypto');

/** @typedef {{operation:string,sha256:string,byteLength:number}} BinaryEvent */
/** @typedef {{operation:string,exports:string[],memories:number}} InstanceEvent */
/** @typedef {{operation:string,byteLength:number,sha256:string}} MemoryEvent */
/**
 * @typedef {{binaries:BinaryEvent[],instances:InstanceEvent[],memories:MemoryEvent[],
 *   sourceBytes:Map<string,Buffer>,memoryDumps:Buffer[],restore:()=>void,snapshot:()=>MemoryEvent[]}} WasmCapture
 */

/** @param {Buffer|Uint8Array} data @returns {string} */
function sha256(data){return createHash('sha256').update(data).digest('hex');}

/**
 * Take a byte-for-byte copy of the BufferSource exposed to the runtime.
 * Unsupported arguments are forwarded untouched to the real WebAssembly API.
 * @param {unknown} source
 * @returns {Buffer|null}
 */
function copySource(source){
  if(ArrayBuffer.isView(source))
    return Buffer.from(source.buffer,source.byteOffset,source.byteLength);
  if(source instanceof ArrayBuffer)return Buffer.from(source);
  return null;
}

/**
 * An independent attacker-controlled preload for public WebAssembly code.
 * It observes genuine constructors and byte-consuming APIs before the target
 * graph is imported. It preserves original module/instance objects, exports,
 * and function execution. It is not an integrity or confidentiality defense.
 *
 * Limit: precompiled Module objects supplied before preload have no recoverable
 * original byte stream through this JS API alone. Native ESM Wasm imports and
 * captured intrinsic references can also bypass this particular hook.
 *
 * @param {typeof globalThis} [realm]
 * @returns {WasmCapture}
 */
function installWasmCapture(realm=globalThis){
  const original=realm.WebAssembly;
  /** @type {BinaryEvent[]} */
  const binaries=[];
  /** @type {InstanceEvent[]} */
  const instances=[];
  /** @type {MemoryEvent[]} */
  const memories=[];
  /** @type {Map<string,Buffer>} */
  const sourceBytes=new Map();
  /** @type {Buffer[]} */
  const memoryDumps=[];
  /** @type {Set<WebAssembly.Memory>} */
  const observedMemories=new Set();
  let restored=false;

  /** @param {unknown} source @param {string} operation @returns {void} */
  function recordSource(source,operation){
    const bytes=copySource(source);
    if(!bytes)return;
    const digest=sha256(bytes);
    binaries.push({operation,sha256:digest,byteLength:bytes.length});
    if(!sourceBytes.has(digest))sourceBytes.set(digest,Buffer.from(bytes));
  }

  /** @param {WebAssembly.Memory} memory @returns {void} */
  function recordMemory(memory){observedMemories.add(memory);}

  /** @param {WebAssembly.Instance} instance @param {string} operation @returns {void} */
  function recordInstance(instance,operation){
    const exported=instance.exports;
    const names=Object.keys(exported);
    let count=0;
    for(const name of names){
      const value=exported[name];
      if(value instanceof original.Memory){recordMemory(value);count++;}
    }
    instances.push({operation,exports:names,memories:count});
  }

  const Module=new Proxy(original.Module,{
    construct(target,args,newTarget){
      recordSource(args[0],'Module');
      return Reflect.construct(target,args,newTarget);
    }
  });
  const Instance=new Proxy(original.Instance,{
    construct(target,args,newTarget){
      const instance=Reflect.construct(target,args,newTarget);
      recordInstance(instance,'Instance');
      return instance;
    }
  });
  const Memory=new Proxy(original.Memory,{
    construct(target,args,newTarget){
      const memory=Reflect.construct(target,args,newTarget);
      recordMemory(memory);
      return memory;
    }
  });
  const proxy=new Proxy(original,{
    get(target,property){
      if(property==='Module')return Module;
      if(property==='Instance')return Instance;
      if(property==='Memory')return Memory;
      if(property==='compile')return /** @param {...unknown} args */ function(...args){
        recordSource(args[0],'compile');
        return Reflect.apply(target.compile,target,args);
      };
      if(property==='instantiate')return /** @param {...unknown} args */ function(...args){
        recordSource(args[0],'instantiate');
        return Reflect.apply(target.instantiate,target,args).then(/** @param {WebAssembly.Instance|{instance:WebAssembly.Instance}} result */ result=>{
          const instance=result instanceof original.Instance?result:result.instance;
          recordInstance(instance,'instantiate');
          return result;
        });
      };
      if(property==='compileStreaming')return /** @param {Response|Promise<Response>} source @param {...unknown} rest */ async function(source,...rest){
        const response=await source;
        recordSource(await response.clone().arrayBuffer(),'compileStreaming');
        return Reflect.apply(target.compileStreaming,target,[response,...rest]);
      };
      if(property==='instantiateStreaming')return /** @param {Response|Promise<Response>} source @param {...unknown} rest */ async function(source,...rest){
        const response=await source;
        recordSource(await response.clone().arrayBuffer(),'instantiateStreaming');
        const result=await Reflect.apply(target.instantiateStreaming,target,[response,...rest]);
        recordInstance(result.instance,'instantiateStreaming');
        return result;
      };
      return Reflect.get(target,property,target);
    }
  });
  realm.WebAssembly=proxy;

  /** @returns {MemoryEvent[]} */
  function snapshot(){
    for(const memory of observedMemories){
      const bytes=Buffer.from(new Uint8Array(memory.buffer));
      memoryDumps.push(bytes);
      memories.push({operation:'memory-snapshot',byteLength:bytes.byteLength,
        sha256:sha256(bytes)});
    }
    return memories.slice();
  }
  function restore(){
    if(restored)return;
    restored=true;
    realm.WebAssembly=original;
  }
  return {binaries,instances,memories,sourceBytes,memoryDumps,snapshot,restore};
}

module.exports={installWasmCapture};
