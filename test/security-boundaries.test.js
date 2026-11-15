'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles,createSnoLauncher,createScoHandler} = require('../src');
const {atomicWrite} = require('../src/atomic');

test('COO browser host check accepts a caller-supplied browser environment',()=>{
  const code=obfuscateFiles([
    {path:'script.js',sourceType:'script',code:'globalThis.payload="observable-payload";'}
  ],{mode:'coo',seed:'host-boundary',allowedHosts:['authorized.example']}).files[0].code;
  // The attacker in the COO threat model fully controls the JavaScript realm.
  const forgedRealm={location:{hostname:'authorized.example'}};
  vm.runInNewContext(code,forgedRealm,{timeout:1000});
  assert.equal(forgedRealm.payload,'observable-payload');
  assert.throws(()=>vm.runInNewContext(code,{
    location:{hostname:'unauthorized.example'}
  },{timeout:1000}),/Unauthorized execution host/);
});

test('SNO filesystem owner can recompute the shipped launcher hash manifest',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-owner-'));
  try {
    const original='module.exports=7;';
    const modified='module.exports=97;';
    const files=[{path:'entry.cjs',code:original}];
    const launcher=createSnoLauncher(files,'entry.cjs');
    const digest=/** @param {string} source */ source=>
      createHash('sha256').update(source).digest('hex');
    // With complete filesystem control, update both the payload and
    // its unkeyed digest. This is a negative security model test.
    const forgedLauncher=launcher.replace(digest(original),digest(modified));
    assert.notEqual(launcher,forgedLauncher);
    await atomicWrite(path.join(dir,'entry.cjs'),modified);
    await atomicWrite(path.join(dir,'sno-entry.cjs'),forgedLauncher);
    const execution=spawnSync(process.execPath,['-e',
      `process.stdout.write(String(require(${JSON.stringify(path.join(dir,'sno-entry.cjs'))})))`
    ],{encoding:'utf8',timeout:5000});
    assert.equal(execution.status,0,execution.stderr);
    assert.equal(execution.stdout,'97');
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('SCO auxiliary Host filter alone is not client authentication',async()=>{
  const server=http.createServer(createScoHandler([
    {path:'app.js',sourceType:'script',code:'globalThis.observed="disclosed-to-caller";'}
  ],{allowedHosts:['authorized.example']}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if (!address || typeof address==='string') throw new Error('Expected TCP listener');
    /** @param {string} host @returns {Promise<{status:number,source:string}>} */
    async function request(host) {
      return new Promise((resolve,reject)=>{
        const req=http.get({hostname:'127.0.0.1',port:address.port,path:'/obfs/app.js',
          headers:{Host:host}},response=>{
          response.setEncoding('utf8');
          let source='';
          response.on('data',chunk=>source+=chunk);
          response.on('end',()=>resolve({status:response.statusCode??0,source}));
        });
        req.on('error',reject);
      });
    }
    assert.equal((await request('wrong.example')).status,403);
    const accepted=await request('authorized.example');
    assert.equal(accepted.status,200);
    const realm={location:{hostname:'authorized.example'}};
    vm.runInNewContext(accepted.source,realm,{timeout:1000});
    assert.equal(realm.observed,'disclosed-to-caller');
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});
