'use strict';

import {createSession} from './state.mjs';

/** @typedef {{kind:unknown,payload:unknown}} InputRecord */
/** @typedef {{serial:number,codeUnits:number,words:number[]}} Observation */

/**
 * Original application interface, with per-record external callback order.
 * The returned JSON makes state evolution and final state observable.
 *
 * @param {number} seed
 * @param {InputRecord[]} records
 * @param {{emit:(record:Observation)=>void}} [host]
 * @returns {string}
 */
export function runScenario(seed,records,host){
  /** @type {Observation[]} */
  const trace=[];
  const sink={emit(/** @type {Observation} */ event){
    trace.push(event);
    if(host)host.emit(event);
  }};
  const session=createSession(sink,seed);
  const output=records.map(record=>session.apply(record));
  return JSON.stringify({output,snapshot:session.snapshot(),trace});
}
