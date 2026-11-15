'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {lowerWasmI32Functions}=require('../../src/wasm-i32');

/** @param {string} source @returns {(x:number)=>number} */
function load(source) {
  const module={exports:null};
  vm.runInNewContext(source,{module,globalThis},{timeout:2000});
  return /** @type {(x:number)=>number} */ (module.exports);
}

/**
 * Verify a checked-in generated output and explicitly demonstrate that an
 * attacker can clone the embedded Wasm without the original JS source.
 * @returns {void}
 */
function main() {
  const directory=__dirname;
  const before=fs.readFileSync(path.join(directory,'before.cjs'),'utf8').replace(/\r\n/g,'\n');
  const after=fs.readFileSync(path.join(directory,'after.cjs'),'utf8').replace(/\r\n/g,'\n');
  const emitted=lowerWasmI32Functions(before,'commonjs',{
    seed:'agent28-wasm-sample-v1',names:['scramble']
  });
  assert.equal(emitted.code,after,'Generated after.cjs must match source and seed');
  assert.equal(emitted.functions,1);
  const native=load(before),protectedFn=load(after);
  const publicBytes=after.match(/Uint8Array\.from\((\[[0-9,]+\])\)/u);
  assert.ok(publicBytes);
  const binary=Uint8Array.from(JSON.parse(publicBytes[1]));
  assert.ok(WebAssembly.validate(binary));
  const cloned=/** @type {(x:number)=>number} */ (
    new WebAssembly.Instance(new WebAssembly.Module(binary)).exports.f);
  let verified=0;
  for(let x=-2000;x<=2000;x++) {
    assert.equal(protectedFn(x),native(x));
    assert.equal(cloned(x),native(x));
    verified++;
  }
  console.log(JSON.stringify({
    generatedBytes:Buffer.byteLength(after),wasmBytes:emitted.wasmBytes,
    originalSHA256:createHash('sha256').update(before).digest('hex'),
    generatedSHA256:createHash('sha256').update(after).digest('hex'),
    typedInputsVerified:verified,cloneFromPublicBinary:true
  }));
}

if(require.main===module)main();
module.exports={main};
