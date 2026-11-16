'use strict';

export function round1(input){return ((((((((((((input|0)+13)-7)+201)-5)+61)-16)+42)-13)+79)-31)|0);}
export function round2(input){return ((((((((((((input|0)+19)-11)+47)-17)+211)-43)+29)-3)+83)-23)|0);}
export function round3(input){return ((((((((((((input|0)+97)-13)+25)-9)+63)-17)+171)-27)+55)-21)|0);}

/**
 * Repeated string-dependent state evolution; it deliberately consumes
 * three independently protected, integer-normalized leaves.
 * @param {number} seed
 * @param {string} message
 * @returns {number}
 */
export function digest(seed,message) {
  let state=seed|0;
  for(let index=0;index<message.length;index++){
    const char=message.charCodeAt(index);
    state=Math.imul(round1((state^char)|0)^round2((char+index)|0),0x45d9f3b)|0;
    state=round3((state^(state>>>13))|0);
  }
  return state|0;
}
