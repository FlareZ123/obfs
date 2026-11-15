'use strict';

const vm = require('node:vm');

/**
 * Observe reconstructed string fragments in a runtime controlled by an attacker.
 * This is a demonstration for trusted research fixtures only. Node's vm module
 * is not a security sandbox for hostile programs.
 *
 * The hook is installed before the protected program initializes. It does not
 * inspect helper names, parse the obfuscated source, or know any decoder keys.
 *
 * @param {string} code
 * @param {{timeoutMs?:number}} [options]
 * @returns {{fragments:string[],publicResult:unknown}}
 */
function traceStringConstruction(code, options = {}) {
  /** @type {string[]} */
  const fragments = [];
  const context = vm.createContext({
    __obfsPublicResult: null,
    __obfsRecordFragment: (/** @type {string} */ fragment) => {
      fragments.push(fragment);
    }
  });
  const patch = '(()=>{' +
    'const native=String.fromCharCode;' +
    'String.fromCharCode=function(...units){' +
    'const fragment=Reflect.apply(native,String,units);' +
    'globalThis.__obfsRecordFragment(fragment);' +
    'return fragment;' +
    '};' +
    '})();';
  vm.runInContext(patch, context, {timeout: options.timeoutMs ?? 1000});
  vm.runInContext(code, context, {timeout: options.timeoutMs ?? 1000});
  return {fragments, publicResult: context.__obfsPublicResult};
}

module.exports = {traceStringConstruction};
