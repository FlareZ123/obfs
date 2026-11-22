'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');

function runNode(path) {
  return spawnSync(process.execPath,[path],{encoding:'utf8',timeout:30000});
}

test('benchmark private-helper workloads retain property yield and stay within budget',()=>{
  const result=runNode('test/benchmark.js');
  assert.equal(result.status,0,result.stderr||result.stdout||'benchmark failed');
});

test('verified record-session profile retains private cross-file rewrite yield',()=>{
  const result=runNode('sims/verified-record-session-profile.js');
  assert.equal(result.status,0,result.stderr||result.stdout||'verified record-session profile failed');
});
