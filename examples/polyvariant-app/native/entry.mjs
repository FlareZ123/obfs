'use strict';
import {createSession} from './state.mjs';

/**
 * Host APIs are external to the file group. The obfuscator must retain their
 * property names while preserving stateful event order and emitted records.
 * @param {number} seed
 * @param {{kind:unknown,payload:unknown}[]} records
 * @param {{emit:(value:unknown)=>void}|undefined} [host]
 * @returns {string}
 */
export function runScenario(seed,records,host){
  const trace=[];
  const sink={emit(item){trace.push(item);if(host)host.emit(item);}};
  const session=createSession(sink,seed);
  const output=records.map(record=>session.apply(record));
  return JSON.stringify({output,snapshot:session.snapshot(),trace});
}
