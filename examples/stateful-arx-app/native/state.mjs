'use strict';

import {advance} from './kernel.mjs';

/** @typedef {{kind:unknown,payload:unknown}} InputRecord */
/** @typedef {{serial:number,codeUnits:number,words:number[]}} Observation */

/**
 * Stateful interface with host-observable record emissions and UTF-16 input.
 * Keeping the host callback outside the arithmetic loop allows a future
 * batched Wasm implementation to reproduce observable callback boundaries.
 *
 * @param {{emit:(record:Observation)=>void}} host
 * @param {number} seed
 * @returns {{apply:(record:InputRecord)=>Observation,snapshot:()=>Observation}}
 */
export function createSession(host,seed){
  const words=new Uint32Array(4);
  words[0]=seed>>>0;
  words[1]=(seed^0x243f6a88)>>>0;
  words[2]=(Math.imul(seed|0,0x85ebca6b)+0x13198a2e)>>>0;
  words[3]=((seed>>>1)^0x03707344)>>>0;
  let serial=0;
  let codeUnits=0;

  /** @returns {Observation} */
  function snapshot(){
    return {serial,codeUnits,words:Array.from(words)};
  }

  return {
    apply(record){
      const message=String(record.kind)+':'+String(record.payload);
      for(let index=0;index<message.length;index++){
        advance(words,message.charCodeAt(index),codeUnits);
        codeUnits++;
      }
      serial++;
      const event=snapshot();
      host.emit(event);
      return event;
    },
    snapshot
  };
}
