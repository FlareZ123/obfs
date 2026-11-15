'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/**
 * Compare the same ESM graph before and after obfuscation in real Node loaders.
 * @param {{path:string,code:string}[]} files
 * @returns {Promise<import('../src/core').OutputFile[]>}
 */
async function compare(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obfs-esm-names-'));
  try {
    const input = path.join(root, 'input');
    const output = path.join(root, 'output');
    const transformed = obfuscateFiles(files.map(file => ({...file,sourceType:'module'})), {
      mode:'coo',seed:'quoted-exports-regression',properties:false,identifiers:false,strings:true
    }).files;
    for (const file of files) await atomicWrite(path.join(input,file.path),file.code);
    for (const file of transformed) await atomicWrite(path.join(output,file.path),file.code);
    const source = spawnSync(process.execPath,[path.join(input,'consumer.mjs')],{encoding:'utf8'});
    const encoded = spawnSync(process.execPath,[path.join(output,'consumer.mjs')],{encoding:'utf8'});
    assert.equal(source.status,0,source.stderr);
    assert.equal(encoded.status,0,encoded.stderr);
    assert.equal(encoded.stdout,source.stdout);
    assert.equal(encoded.stderr,source.stderr);
    return transformed;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('quoted ESM export and import names remain syntax tokens',async()=>{
  const transformed = await compare([
    {path:'producer.mjs',code:'const secret="runtime-secret-string";export {secret as "long-quoted-export-name"};'},
    {path:'consumer.mjs',code:'import {"long-quoted-export-name" as received} from "./producer.mjs";console.log(received);'}
  ]);
  const producer=transformed.find(file=>file.path==='producer.mjs');
  const consumer=transformed.find(file=>file.path==='consumer.mjs');
  assert.ok(producer);
  assert.ok(consumer);
  assert.match(producer.code,/"long-quoted-export-name"/);
  assert.match(consumer.code,/"long-quoted-export-name"/);
  assert.ok(producer.metrics.literals>0,'Ordinary runtime strings should still be encoded');
});

test('quoted names in ESM reexports and downstream imports stay valid',async()=>{
  const transformed = await compare([
    {path:'producer.mjs',code:'export const value="runtime-reexport-value";'},
    {path:'relay.mjs',code:'export {value as "long-reexported-name"} from "./producer.mjs";'},
    {path:'consumer.mjs',code:'import {"long-reexported-name" as received} from "./relay.mjs";console.log(received);'}
  ]);
  const relay=transformed.find(file=>file.path==='relay.mjs');
  assert.ok(relay);
  assert.match(relay.code,/"long-reexported-name"/);
});
