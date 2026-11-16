/**
 * This browser-host interface belongs to the caller, not to the compiler.
 * @param {number} input
 * @returns {number}
 */
export function hostValue(input){
  return globalThis.window.externalValue(input);
}
