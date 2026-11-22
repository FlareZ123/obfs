import {state} from './private.mjs';
import {hostValue} from './host.mjs';

// Keep private state-field reads at module scope. Exported callable source
// references only the captured numeric values, never the private key tokens.
const offset=state.secretOffset;
const salt=state.secretSalt;

/**
 * Stateful 32-bit native arithmetic with observable host interactions.
 * @param {number} seed
 */
export function createEngine(seed){
  let accumulator=seed>>>0;
  let sequence=0;
  return {
    /** @param {number} input @returns {number} */
    next(input){
      const host=hostValue(input);
      let a=(host^offset^accumulator)>>>0;
      let b=(input+salt+sequence)>>>0;
      a=Math.imul(a^(a>>>16),0x7feb352d)>>>0;
      b=Math.imul(b^(b>>>15),0x846ca68b)>>>0;
      a=Math.imul((a+b)>>>0,0x9e3779b1)>>>0;
      b=Math.imul((b^a)>>>0,0x85ebca6b)>>>0;
      accumulator=(a^b^(a>>>13)^(b>>>16))>>>0;
      sequence++;
      return accumulator;
    },
    snapshot(){return {accumulator,sequence};}
  };
}
