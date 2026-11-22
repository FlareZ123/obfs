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

test('uppercase NODE_MODULES package boundary matches native Node semantics',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const host=path.join(root,'host');
    const output=path.join(host,'NODE_MODULES','pkg');
    const entry=path.join(source,'entry.js');
    await atomicWrite(entry,'module.exports=163;');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await atomicWrite(path.join(output,'entry.js'),'module.exports=163;');

    const native=run(path.join(output,'entry.js'));
    if(process.platform==='win32') {
      assert.equal(native.status,0,'Native Windows should treat uppercase NODE_MODULES as node_modules: '+native.stderr);
      assert.equal(native.stdout,'163');
      await main('sno',['--root',source,'--entry','entry.js','--out',output]);
      const compiled=run(path.join(output,'sno-entry.cjs'));
      assert.equal(compiled.status,0,compiled.stderr);
      assert.equal(compiled.stdout,'163');
    } else {
      assert.notEqual(native.status,0,
        'Linux uppercase NODE_MODULES should inherit external ESM package scope');
      await assert.rejects(main('sno',['--root',source,'--entry','entry.js','--out',output]),
        /SNO output \.js inherits external ESM package scope/);
    }
  });
});
