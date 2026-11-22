'use strict';

const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const test=require('node:test');

/**
 * An exported instance exposes the native class prototype to downstream
 * importers. A later importer is outside the protected input graph, so
 * `closedWorld` alone cannot prove its method source to be unobservable.
 *
 * This test wraps the independent multi-module native-versus-emitted harness,
 * which also requires the unrelated private module to retain property yield.
 */
test('COO/SNO exported instance prototype retains method source and private yield',()=>{
  const runner=path.resolve(__dirname,'../sims/public-instance-source-probe.js');
  const child=spawnSync(process.execPath,[runner],{
    encoding:'utf8',timeout:30000
  });
  assert.ifError(child.error);
  const rows=child.stdout.trim().split(/\r?\n/).filter(Boolean)
    .map(/** @param {string} line */ line=>JSON.parse(line));
  assert.deepEqual(rows.map(row=>row.mode),['coo','sno'],child.stderr);
  for(const row of rows){
    assert.equal(row.valuesEqual,true,JSON.stringify(row));
    assert.ok(row.propertyRenames>0,JSON.stringify(row));
    assert.ok(row.privatePropertyRenames>0,JSON.stringify(row));
  }
  assert.ok(rows.every(row=>row.sourceEqual),JSON.stringify(rows,null,2));
  assert.equal(child.status,0,child.stderr);
});
