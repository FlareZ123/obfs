'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {installWasmCapture}=require('../sims/wasm-runtime-capture');
const {cloneObservedWasm}=require('../sims/wasm-captured-clone');

const raw=Uint8Array.from([0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,
  3,2,1,0,7,7,1,3,114,117,110,0,0,10,6,1,4,0,65,42,11]);
const digest=createHash('sha256').update(raw).digest('hex');

test('real ESM sync instantiate preserves behavior and captures exact public wasm bytes',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'wasm-attacker-'));
  const entry=path.join(folder,'entry.mjs');
  await fs.writeFile(entry,'export function execute(){const bytes=Uint8Array.from('+JSON.stringify([...raw])+');return new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.run();}\n');
  const capture=installWasmCapture();
  try {
    const imported=await import(pathToFileURL(entry).href);
    assert.equal(imported.execute(),42);
    assert.equal(capture.binaries.length,1);
    assert.equal(capture.binaries[0].sha256,digest);
    assert.deepEqual(capture.sourceBytes.get(digest),Buffer.from(raw));
    assert.deepEqual(capture.instances.map(x=>x.exports),[['run']]);
  } finally {capture.restore();await fs.rm(folder,{recursive:true,force:true});}
});

test('compile, instantiate and streaming forms preserve outputs and public bytes',async()=>{
  const capture=installWasmCapture();
  try {
    const module=await WebAssembly.compile(raw);
    const a=await WebAssembly.instantiate(module);
    assert.equal(/** @type {Function} */ (a.exports.run)(),42);
    const b=await WebAssembly.instantiate(raw);
    assert.equal(/** @type {Function} */ (b.instance.exports.run)(),42);
    const streamed=await WebAssembly.instantiateStreaming(
      Promise.resolve(new Response(raw,{headers:{'Content-Type':'application/wasm'}})));
    assert.equal(/** @type {Function} */ (streamed.instance.exports.run)(),42);
    assert.ok(capture.binaries.some(x=>x.operation==='compile'));
    assert.ok(capture.binaries.some(x=>x.operation==='instantiate'));
    assert.ok(capture.binaries.some(x=>x.operation==='instantiateStreaming'));
    assert.ok(capture.binaries.filter(x=>x.sha256===digest).length>=3,
      'Expected target module among any runtime-internal Wasm compilations');
    assert.equal(capture.instances.length,3);
  } finally {capture.restore();}
});

test('exported/imported memories remain observable, restoration is idempotent',()=>{
  const original=WebAssembly;
  const capture=installWasmCapture();
  try {
    const memory=new WebAssembly.Memory({initial:1});
    new Uint8Array(memory.buffer)[7]=99;
    const entries=capture.snapshot();
    assert.equal(entries.length,1);
    assert.equal(entries[0].byteLength,65536);
    assert.equal(capture.memoryDumps[0][7],99);
    assert.notEqual(entries[0].sha256,createHash('sha256').update(Buffer.alloc(65536)).digest('hex'));
  } finally {capture.restore();capture.restore();}
  assert.equal(WebAssembly,original);
});

test('attacker independently clones captured WebAssembly and its exact exported ABI',()=>{
  const captured=installWasmCapture();
  try {
    const original=new WebAssembly.Instance(new WebAssembly.Module(raw));
    const replay=cloneObservedWasm(captured,digest);
    assert.equal(/** @type {Function} */(original.exports.run)(),42);
    assert.equal(/** @type {Function} */(replay.instance.exports.run)(),42);
    assert.deepEqual(replay.exports,[{name:'run',kind:'function'}]);
    assert.deepEqual(replay.imports,[]);
    assert.deepEqual(Buffer.from(replay.bytes),Buffer.from(raw));
    assert.throws(()=>cloneObservedWasm(captured,'0'.repeat(64)),
      /Unknown or not yet captured Wasm digest/u);
  } finally {captured.restore();}
});

test('attacker snapshots exported Wasm memory and clones state into another instance',()=>{
  const publicBytes=Uint8Array.from([0,97,115,109,1,0,0,0,5,3,1,0,1,
    7,10,1,6,109,101,109,111,114,121,2,0]);
  const hash=createHash('sha256').update(publicBytes).digest('hex');
  const captured=installWasmCapture();
  try {
    const original=new WebAssembly.Instance(new WebAssembly.Module(publicBytes));
    const first=/** @type {WebAssembly.Memory} */(original.exports.memory);
    new Uint8Array(first.buffer).set([12,25,48,90],64);
    captured.snapshot();
    const copy=cloneObservedWasm(captured,hash);
    const second=/** @type {WebAssembly.Memory} */(copy.instance.exports.memory);
    assert.notEqual(first,second);
    assert.equal(captured.memoryDumps.length,1);
    new Uint8Array(second.buffer).set(captured.memoryDumps[0]);
    assert.deepEqual(new Uint8Array(second.buffer,64,4),new Uint8Array(first.buffer,64,4));
    assert.equal(captured.instances[0].memories,1);
  } finally {captured.restore();}
});
