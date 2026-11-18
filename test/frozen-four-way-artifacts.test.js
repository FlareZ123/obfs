'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {createReceipt,hash}=require('../sims/frozen-four-way-artifacts');

test('frozen four-way source, minifier, candidate and reconstructed bytes are reversible',async()=>{
  const receipt=await createReceipt();
  assert.equal(receipt.schema,'obfs-frozen-four-way-artifacts-v1');
  assert.equal(receipt.settings.minifier.version,'0.28.2');
  assert.deepEqual(Object.keys(receipt.graphs),
    ['native','minified','published','reconstructed']);
  assert.equal(receipt.staticAttack.minifiedRecovered,3);
  assert.equal(receipt.staticAttack.publishedRecovered,3);
  assert.equal(receipt.dependencies.lockSha256.length,64);
  const expected=['math.mjs','state.mjs','entry.mjs'];
  for(const files of Object.values(receipt.graphs)){
    assert.deepEqual(files.map(file=>file.path),expected);
    for(const file of files){
      const restored=Buffer.from(file.base64,'base64');
      assert.equal(restored.length,file.bytes);
      assert.equal(hash(restored),file.sha256);
      assert.equal(restored.toString('base64'),file.base64);
    }
  }
  /** @type {Awaited<ReturnType<typeof createReceipt>>} */
  const archived=JSON.parse(fs.readFileSync(path.join(
    __dirname,'../im-results/frozen-four-way-artifacts-2026-11-18.json'),'utf8'));
  assert.deepEqual(receipt.graphDigests,archived.graphDigests);
  assert.deepEqual(receipt.settings,archived.settings);
  assert.deepEqual(receipt.dependencies,archived.dependencies);
  for(const name of /** @type {(keyof typeof receipt.graphs)[]} */ (
    ['native','minified','published','reconstructed'])){
    assert.deepEqual(receipt.graphs[name],archived.graphs[name]);
  }
  assert.notEqual(receipt.graphDigests.native,receipt.graphDigests.minified);
  assert.notEqual(receipt.graphDigests.native,receipt.graphDigests.published);
});
