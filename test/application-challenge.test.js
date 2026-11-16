'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {compile,NAMES,ROOT}=require('../examples/application-challenge/build.cjs');
const {copyAttack}=require('../sims/application-challenge-offline-copy');

/** @param {string} folder @param {number[][]} cases @returns {any[]} */
function execute(folder,cases){
  const child=spawnSync(process.execPath,[
    path.join(ROOT,folder,'entry.mjs'),JSON.stringify(cases)
  ],{encoding:'utf8',timeout:30000});
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return JSON.parse(child.stdout);
}
const cases=[
  [0,0],[0,1],[1,1],[4294967295,0],[4294967295,3],
  ...Array.from({length:96},(_,i)=>[(Math.imul(i+1,2654435761))>>>0,(i*97)%2048]),
  [0x9e3779b9,100000]
];

test('frozen six-file generated COO output is current and preserves all application cases',async()=>{
  const compiled=await compile();
  assert.equal(compiled.files.length,6);
  assert.ok(compiled.crossFile.properties>=1,
    'No demonstrable private inter-file field renaming');
  for(const file of compiled.files){
    assert.equal(file.sourceType,'module');
    assert.equal(file.code,await fs.readFile(path.join(ROOT,'after',file.path),'utf8'),
      'Generated after/ artifact must be exact compiler output: '+file.path);
  }
  assert.deepEqual(compiled.files.map(file=>file.path),NAMES);
  const original=execute('before',cases);
  const transformed=execute('after',cases);
  assert.deepEqual(transformed,original);
  assert.equal(original[0].state.sequence,0);
  assert.deepEqual(original[0].reflected.keys,['auditCount','externalFormat']);
  assert.equal(original[0].reflected.value,'audit-v1');
  assert.equal(original[0].missing.value,undefined);
  assert.match(await fs.readFile(path.join(ROOT,'after','host.mjs'),'utf8'),
    /externalValue/,'External browser API must remain public and callable');
  assert.match(await fs.readFile(path.join(ROOT,'after','reflect.mjs'),'utf8'),
    /externalFormat/,'Dynamic and reflected property key is not renameable');
});

test('offline attacker with public files alone clones held-out app behavior',()=>{
  const heldout=Array.from({length:160},(_,i)=>[
    (Math.imul(i+0x1234,0x9e3779b1)^(i<<7))>>>0,
    (i*317)%5000
  ]);
  const expected=execute('before',heldout);
  assert.deepEqual(copyAttack(path.join(ROOT,'after'),heldout),expected);
  // An attacker can redistribute and execute public files.
  // This test does not claim deobfuscated readable-source recovery.
});
