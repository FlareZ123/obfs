'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {recoverSymbolKeys}=require('../sims/symbol-key-static-recover');

/** @param {string} code @returns {number[]} */
function sample(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  // The distributed example now publishes a finished result vector. Keep
  // attacker comparisons on the same observable API as its publisher.
  return Array.from(/** @type {number[]} */(context.module.exports));
}

test('seedless public-output attacker removes every Symbol key in generated example',async()=>{
  const before=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/before.cjs'),'utf8');
  const after=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/after.cjs'),'utf8');
  const reconstructed=recoverSymbolKeys(after,'commonjs');
  assert.equal(reconstructed.keys,2);
  assert.doesNotMatch(reconstructed.code,/Symbol\(\)/u);
  assert.deepEqual(sample(reconstructed.code),sample(before));
});

test('attacker also recovers private property accesses after ordinary identifier pass',()=>{
  const source='const bag={privateFlag:7,gate:2};function f(x){bag.privateFlag+=x;return bag.privateFlag^bag.gate;}module.exports=[f(2),f(4),f(-3)];';
  const output=obfuscateFiles([{path:'entry.cjs',code:source,sourceType:'commonjs'}],{
    mode:'sno',seed:'seed-unknown-to-attacker',strings:true,experimentalSymbolKeys:true
  });
  assert.equal(output.files[0].metrics.symbolKeys,2);
  const publicCode=/** @type {string} */ (output.files[0].code);
  const recovered=recoverSymbolKeys(publicCode,'commonjs');
  assert.equal(recovered.keys,2);
  assert.deepEqual(sample(recovered.code),sample(source));
});

test('instrumented native Symbol calls disclose all generated private keys',async()=>{
  // The SCO/COO/SNO threat model lets the attacker instrument its own
  // runtime before evaluating a distributed module. A proxy retains native
  // semantics while recording the exact private Symbol values as they arise.
  const source=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/after.cjs'),'utf8');
  /** @type {symbol[]} */
  const captured=[];
  const trackedSymbol=new Proxy(Symbol,{
    apply(target,thisArg,args) {
      const value=Reflect.apply(target,thisArg,args);
      captured.push(value);
      return value;
    }
  });
  const context={Symbol:trackedSymbol,module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  assert.equal(captured.length,2);
  assert.notEqual(captured[0],captured[1]);
  assert.equal(typeof captured[0],'symbol');
  assert.equal(Symbol.keyFor(captured[0]),undefined);
  assert.deepEqual(Array.from(/** @type {number[]} */(context.module.exports)),
    [10,14,9]);
});

test('host can silently collide generated keys without editing protected source',async()=>{
  const original=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/before.cjs'),'utf8');
  const emitted=await fs.readFile(path.join(__dirname,'../examples/symbol-keys/after.cjs'),'utf8');
  const shared=Symbol('attacker-controlled-collision');
  const context={Symbol:()=>shared,module:{exports:null}};
  vm.runInNewContext(emitted,context,{timeout:1000});
  const baseline=sample(original);
  const tampered=Array.from(/** @type {number[]} */(context.module.exports));
  assert.notDeepEqual(tampered,baseline);
  assert.equal(Object.isFrozen(context),false);
});
