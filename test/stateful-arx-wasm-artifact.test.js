'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {buildStatefulArxWasm}=require('../sims/stateful-arx-wasm-build');

test('published four-word stateful Wasm client bytes match exactly the fixed lowerer',()=>{
  const built=buildStatefulArxWasm();
  const kernel=readFileSync(
    path.join(__dirname,'../examples/stateful-arx-app/wasm/kernel.mjs'),'utf8');
  const match=/const publicHex='([0-9a-f]+)'/u.exec(kernel);
  assert.ok(match,'Expected explicit public frozen Wasm hex');
  const published=Uint8Array.from(Buffer.from(match[1],'hex'));
  const sha256=createHash('sha256').update(published).digest('hex');
  assert.equal(published.byteLength,228);
  assert.equal(sha256,'820810c29949179df5e2cc2d7246b15efe1267fe898390703fc77e3df4f9a96f');
  assert.deepEqual(built,published);
  assert.equal(WebAssembly.validate(published),true);
  console.log('STATEFUL_ARX_WASM_ARTIFACT '+JSON.stringify({
    wasmSha256:sha256,bytes:published.byteLength,
    privateToPublicBoundary:'none: all code and state are shipped to the client',
    nodeWasmValidation:true
  }));
});
