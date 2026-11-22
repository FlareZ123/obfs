'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

test('source-preserving private-reader six-module session profile retains real cross-file yield',()=>{
  const result=spawnSync(process.execPath,[
    path.join(__dirname,'../sims/verified-record-session-profile.js')
  ],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
  if(result.error)throw result.error;
  assert.equal(result.status,0,
    'Six-module source-preserving session profile failed: '+result.stdout+'\n'+result.stderr);
  const marker='VERIFIED_RECORD_SESSION_PROFILE ';
  const line=result.stdout.split(/\r?\n/u).find(row=>row.startsWith(marker));
  assert.ok(line,result.stdout);
  /** @type {{rows:Array<{privateFieldsRenamed:number,within2point5:boolean,allOutputsEqual:boolean}>}} */
  const profile=JSON.parse(line.slice(marker.length));
  assert.equal(profile.rows.length,4);
  assert.ok(profile.rows.every(row=>
    row.privateFieldsRenamed===2&&row.within2point5&&row.allOutputsEqual),
  'Every independent application variant must retain nonvacuous 2-field parity');
  process.stdout.write(result.stdout);
});
