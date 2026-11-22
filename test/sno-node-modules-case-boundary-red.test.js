'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

/** @param {(root:string)=>Promise<void>} fn @returns {Promise<void>} */
async function withFixture(fn) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-nodemod-case-'));
  try { await fn(root); } finally { await fs.rm(root,{recursive:true,force:true}); }
}
/** @param {string} entry @returns {import('node:child_process').SpawnSyncReturns<string>} */
function run(entry) {
  return spawnSync(process.execPath,
    ['--eval','process.stdout.write(String(require(process.argv[1])))',entry],
    {encoding:'utf8',timeout:15000});
}

test('Node uppercase NODE_MODULES is not a package-scope boundary',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const host=path.join(root,'host');
    const output=path.join(host,'NODE_MODULES','pkg');
    const runner=path.join(root,'runner.cjs');
    const entry=path.join(source,'entry.js');
    await atomicWrite(entry,'module.exports=163;');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await atomicWrite(path.join(output,'entry.js'),'module.exports=163;');
    await atomicWrite(runner,'process.stdout.write(String(require(process.argv[2])));');

    const original=spawnSync(process.execPath,[runner,entry],
      {encoding:'utf8',timeout:15000});
    const relocated=spawnSync(process.execPath,[runner,path.join(output,'entry.js')],
      {encoding:'utf8',timeout:15000});
    assert.equal(original.status,0,original.stderr);
    assert.equal(original.stdout,'163');
    assert.notEqual(relocated.status,0);
    assert.match(relocated.stderr,/module is not defined|ERR_REQUIRE_ESM|ES module/i);
  });
});
