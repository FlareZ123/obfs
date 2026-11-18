'use strict';

const assert=require('node:assert/strict');

/** @typedef {import('./wasm-runtime-capture').WasmCapture} WasmCapture */

/**
 * Replay an exact captured public WebAssembly module in a fresh instance.
 * No reference to the source compiler, seed, or original functions is needed.
 * A caller may pass imports already available to the attacker in the same
 * controlled runtime. Refuse unknown binaries instead of guessing.
 *
 * @param {WasmCapture} capture
 * @param {string} digest
 * @param {WebAssembly.Imports} [imports]
 * @returns {{bytes:Uint8Array,module:WebAssembly.Module,instance:WebAssembly.Instance,
 *   exports:{name:string,kind:string}[],imports:{module:string,name:string,kind:string}[]}}
 */
function cloneObservedWasm(capture,digest,imports={}){
  assert.match(digest,/^[a-f0-9]{64}$/u,'Expected SHA-256 of captured wasm');
  const original=capture.sourceBytes.get(digest);
  assert.ok(original,'Unknown or not yet captured Wasm digest');
  const bytes=Uint8Array.from(original);
  const module=new WebAssembly.Module(bytes);
  const required=WebAssembly.Module.imports(module);
  const supplied=imports??{};
  const instance=new WebAssembly.Instance(module,supplied);
  return {bytes,module,instance,exports:WebAssembly.Module.exports(module),imports:required};
}

module.exports={cloneObservedWasm};
