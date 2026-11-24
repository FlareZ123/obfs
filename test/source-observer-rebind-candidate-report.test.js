'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');

test('report-only execution of the exact pinned direct-validator harness against c243152',()=>{
  const root=path.resolve(__dirname,'..');
  const harness=path.join(root,'im-results','source-observer-rebind-counterexamples-2026-11-24.js');
  console.log('CANDIDATE_SOURCE_COMMIT=c243152490394f9289e5516548d93005995711b6');
  console.log('CANDIDATE_SOURCE_BLOB=cf1df37a');
  console.log('PINNED_HARNESS_BLOB=01ab16a62a1e7bd586126c0637633e24fad9df64');
  const result=spawnSync(process.execPath,[harness],{cwd:root,encoding:'utf8',timeout:30000});
  console.log('DIRECT_VALIDATOR_EXIT_STATUS='+String(result.status));
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  assert.equal(result.error,undefined,'the pinned direct-validator harness must start');
  assert.equal(typeof result.status,'number','the pinned harness must exit normally');
});
