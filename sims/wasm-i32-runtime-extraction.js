'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

/**
 * A hostile runtime owns the global WebAssembly and Uint8Array bindings.
 * It captures every compiled module's public bytes and can replace every
 * Wasm-exported function without changing the published JavaScript text.
 *
 * @param {string} published
 * @returns {{original:number,cloned:number,capturedBytes:number,tampered:number}}
 */
function attack(published) {
  /** @type {Uint8Array[]} */
  const captured=[];
  const intercepted={
    Uint8Array,
    WebAssembly:{
      Module:class {
        /** @param {Uint8Array} bytes */
        constructor(bytes) {
          captured.push(Uint8Array.from(bytes));
          return new WebAssembly.Module(/** @type {BufferSource} */(/** @type {unknown} */(bytes)));
        }
      },
      Instance:class {
        /** @param {WebAssembly.Module} wasm */
        constructor(wasm) {
          return new WebAssembly.Instance(wasm);
        }
      }
    }
  };
  /** @type {{exports:unknown}} */
  const module={exports:null};
  vm.runInNewContext(published,{module,globalThis:intercepted},{timeout:2000});
  const wrapped=/** @type {(x:number)=>number} */(module.exports);
  const original=wrapped(31);
  assert.equal(captured.length,1);
  const cloned=/** @type {(x:number)=>number} */(
    new WebAssembly.Instance(new WebAssembly.Module(/** @type {BufferSource} */(/** @type {unknown} */(captured[0])))).exports.f)(31);
  assert.equal(cloned,original);
  const substituteGlobal={
    Uint8Array,
    WebAssembly:{
      Module:class {
        /** @param {Uint8Array} bytes */
        constructor(bytes){return new WebAssembly.Module(/** @type {BufferSource} */(/** @type {unknown} */(bytes)));}
      },
      Instance:class {
        /** @param {WebAssembly.Module} module */
        constructor(module) {
          assert.ok(module instanceof WebAssembly.Module);
          return {exports:{f:/** @param {number} x */ x=>x===31?7331:0}};
        }
      }
    }
  };
  const tamperModule={exports:null};
  vm.runInNewContext(published,{module:tamperModule,globalThis:substituteGlobal},{timeout:2000});
  const replaced=/** @type {(x:number)=>number} */(/** @type {unknown} */(tamperModule.exports));
  const tampered=replaced(31);
  assert.equal(tampered,7331);
  assert.notEqual(tampered,original);
  return {original,cloned,capturedBytes:captured[0].length,tampered};
}

/** @returns {{mode:string,original:number,cloned:number,capturedBytes:number,tampered:number}[]} */
function experiment() {
  const source='function f(x){return (((x^137)&(x>>>3))|(x<<7));}module.exports=f;';
  /** @type {{mode:string,original:number,cloned:number,capturedBytes:number,tampered:number}[]} */
  const results=[];
  for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
    const output=obfuscateFiles([{
      path:'kernel.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'hostile-wasm-runtime-'+mode,
      experimentalWasmI32:{'kernel.cjs':['f']}
    });
    assert.equal(output.files[0].metrics.wasmI32Functions,1);
    results.push({mode,...attack(String(output.files[0].code))});
  }
  return results;
}

if(require.main===module)process.stdout.write(JSON.stringify(experiment(),null,2)+'\n');
module.exports={experiment};
