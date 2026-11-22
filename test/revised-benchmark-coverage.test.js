'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

test('reviewed hot-work bench preserves exported sources and nonzero private-field coverage',()=>{
  const result=spawnSync(process.execPath,[path.join(__dirname,'benchmark.js')],{
    encoding:'utf8',timeout:120000,maxBuffer:1024*1024
  });
  if(result.error)throw result.error;
  assert.equal(result.status,0,[
    'Reworked benchmark failed exact property-yield, source-parity, or 2.5x check',
    result.stdout,result.stderr
  ].join('\n'));
  const rows=result.stdout.split(/\r?\n/u).filter(Boolean);
  assert.equal(rows.length,11,result.stdout);
  const count=rows.filter(row=>/properties [1-9]\d*/u.test(row)).length;
  assert.equal(count,10,'All ten hot work loops must rename at least one private field');
});
