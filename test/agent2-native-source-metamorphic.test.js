'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

/**
 * A second, compiler-independent Node execution checks that each native
 * WeakMap source-observer witness is sensitive to a binding-only source
 * mutation exactly when the global WeakMap.prototype is actually reached.
 * No compiler imports, transformed code, baseline/Z3 labels, or runtime
 * extraction heuristics participate in this oracle.
 */
test('96-case native CFG function-source metamorphic witnesses independently check out',{timeout:180000},()=>{
  const root=path.resolve(__dirname,'..');
  const child=spawnSync(process.execPath,[
    path.join(root,'sims','agent2-native-source-oracle.cjs'),
    '--matrix',
    path.join(root,'test','agent3-weakmap-cfg-matrix.test.js')
  ],{cwd:root,encoding:'utf8',timeout:170000,maxBuffer:8*1024*1024});
  assert.equal(child.status,0,child.stderr||child.stdout||'native oracle timed out');
  const prefix='NATIVE_SOURCE_METAMORPHIC ';
  const line=child.stdout.trim().split(/\r?\n/).find(row=>row.startsWith(prefix));
  assert.ok(line,child.stdout);
  const result=JSON.parse(line.slice(prefix.length));
  assert.equal(result.cases,96);
  assert.ok(result.positive>0);
  assert.ok(result.negative>0);
  assert.equal(result.sourceMismatches,0);
});
