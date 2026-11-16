'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('source-only SCO spelling mask predicts entire 24-response fixture without nonce',()=>{
  const script=path.join(__dirname,'../sims/sco-spelling-mask-attack.js');
  const child=spawnSync(process.execPath,[script],{
    encoding:'utf8',timeout:20000,windowsHide:true
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  /** @type {{requests:number,distinctResponses:number,recoveredMaskBitsPerResponse:number,exactPredictions:number,originalNonceBits:number,scope:string}} */
  const report=JSON.parse(child.stdout.trim());
  assert.equal(report.requests,24);
  assert.equal(report.exactPredictions,24);
  assert.equal(report.recoveredMaskBitsPerResponse,32);
  assert.equal(report.originalNonceBits,192);
  assert.ok(report.distinctResponses>1);
  assert.equal(report.scope,'canonical-double-quoted-literal fixture');
});
