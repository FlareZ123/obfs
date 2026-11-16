'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {recoverPublicStrings}=require('../sims/jsdeobsbench-public-static-attack');

/**
 * Run an ESM module under the real Node loader, with a host-owned callback
 * whose member name is intentionally excluded from obfuscation.
 * @param {string} directory
 * @param {string} code
 * @returns {Promise<string>}
 */
async function execute(directory,code) {
  await fs.mkdir(directory,{recursive:true});
  await atomicWrite(path.join(directory,'module.mjs'),code);
  await atomicWrite(path.join(directory,'entry.mjs'),[
    "globalThis.externalApi={decorate(value){return 'host:'+value}};",
    "const candidate=await import('./module.mjs');",
    "console.log(JSON.stringify([candidate.privateMessage,candidate.deliver()]));"
  ].join('\n'));
  const result=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
    encoding:'utf8',timeout:10000,maxBuffer:1024*1024
  });
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}

test('public static XOR decoder recovers delivered opt-in COO/SCO and default SNO ESM',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-public-esm-'));
  const secret='code-delivered-to-client-is-not-a-private-secret';
  const original=[
    'export const privateMessage='+JSON.stringify(secret)+';',
    'export function deliver(){return globalThis.externalApi.decorate(privateMessage)}'
  ].join('\n');
  try {
    const native=await execute(path.join(directory,'native'),original);
    assert.equal(native,JSON.stringify([secret,'host:'+secret])+'\n');
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      const encoded=obfuscateFiles([{path:'module.mjs',sourceType:'module',code:original}],{
        mode,seed:'public-module-static-'+mode,identifiers:false,properties:false,
        strings:mode==='sno'?undefined:true
      }).files[0];
      assert.ok(encoded.metrics.literals>0,mode+' did not enable a public string encoder');
      const recovered=recoverPublicStrings(String(encoded.code),'module');
      assert.equal(recovered.literals,encoded.metrics.literals,mode);
      assert.equal(recovered.tables,1,mode);
      assert.ok(recovered.code.includes(JSON.stringify(secret)),mode+' did not recover the literal');
      assert.equal(await execute(path.join(directory,mode,'encoded'),String(encoded.code)),native);
      assert.equal(await execute(path.join(directory,mode,'recovered'),recovered.code),native);
    }
  } finally {
    await fs.rm(directory,{force:true,recursive:true});
  }
});
