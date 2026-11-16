'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {createScoHandler}=require('../src');

/** @returns {Promise<void>} */
async function main() {
  const first='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
  const second='ghijklmnopqrstuvwxyz0123456789AB';
  // Immutable primitive concatenation exercises the positive compiler proof.
  const original='const firstMarker='+JSON.stringify(first)+';\n'+
    'const secondMarker='+JSON.stringify(second)+';\n'+
    'globalThis.maskProof=firstMarker+secondMarker;\n';
  const server=http.createServer(createScoHandler([
    {path:'entry.js',sourceType:'script',code:original}
  ]));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected TCP listener');
    const distinct=new Set();
    for(let n=0;n<24;n++) {
      const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/entry.js');
      assert.equal(response.status,200);
      const served=await response.text();
      distinct.add(createHash('sha256').update(served).digest('hex'));
      // Only the served bytes enter a separate attacker process.
      const child=spawnSync(process.execPath,[
        path.join(__dirname,'sco-spelling-mask-extractor.js')
      ],{input:served,encoding:'utf8',timeout:10000,windowsHide:true});
      if(child.error)throw child.error;
      assert.equal(child.status,0,child.stderr);
      const attack=JSON.parse(child.stdout);
      assert.equal(attack.predictedDigest,
        createHash('sha256').update(served).digest('hex'));
      assert.equal(attack.eligible,2);
      assert.equal(attack.anchor,first);
      assert.equal(attack.mask.length,32);
      assert.ok(attack.mask.every(bit=>bit===0||bit===1));
      assert.equal(attack.matched,true,'The predicted full variant must match every byte');
    }
    assert.ok(distinct.size>1,'Independent requests should vary');
    process.stdout.write(JSON.stringify({requests:24,distinctResponses:distinct.size,
      recoveredMaskBitsPerResponse:32,exactPredictions:24,
      originalNonceBits:192,scope:'canonical-double-quoted-literal fixture'})+'\n');
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
