'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

test('SCO detached unobserved execute promise cannot crash process in strict rejection mode',()=>{
  const child=spawnSync(process.execPath,[
    '--unhandled-rejections=strict',
    path.join(__dirname,'../sims/sco-detached-unhandled-fixture.js')
  ],{encoding:'utf8',timeout:15000});
  assert.equal(child.status,0,
    'Detached isolation process exited abnormally: '+child.stderr);
  assert.match(child.stdout,/^PASS detached SCO promise ignored/um);
});
