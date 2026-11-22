'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

/** @param {(root:string)=>Promise<void>} callback @returns {Promise<void>} */
async function withFixture(callback) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-typeless-'));
  try { await callback(root); }
  finally { await fs.rm(root,{recursive:true,force:true}); }
}
/** @param {string} entry @returns {import('node:child_process').SpawnSyncReturns<string>} */
function run(entry) {
  const code="require(process.argv[1]).then(value=>process.stdout.write(String(value))).catch(error=>{console.error(error);process.exitCode=1;});";
  return spawnSync(process.execPath,['--eval',code,entry],{encoding:'utf8',timeout:15000});
}

test('control: explicit ESM package .js imported by CommonJS entry',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const output=path.join(root,'distribution');
    await atomicWrite(path.join(source,'package.json'),'{"type":"module"}');
    await atomicWrite(path.join(source,'entry.cjs'),
      "module.exports=import('./feature.js').then(mod=>mod.answer);");
    await atomicWrite(path.join(source,'feature.js'),'export const answer=167;');

    const native=run(path.join(source,'entry.cjs'));
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'167');
    await main('sno',['--root',source,'--entry','entry.cjs','--out',output]);
    const compiled=run(path.join(output,'sno-entry.cjs'));
    assert.equal(compiled.status,0,compiled.stderr);
    assert.equal(compiled.stdout,native.stdout);
  });
});

test('RED candidate: Node syntax-detected typeless .js dependency preserves ESM import',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const output=path.join(root,'distribution');
    await atomicWrite(path.join(source,'entry.cjs'),
      "module.exports=import('./feature.js').then(mod=>mod.answer);");
    await atomicWrite(path.join(source,'feature.js'),'export const answer=167;');

    const native=run(path.join(source,'entry.cjs'));
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'167');
    await main('sno',['--root',source,'--entry','entry.cjs','--out',output]);
    const compiled=run(path.join(output,'sno-entry.cjs'));
    assert.equal(compiled.status,0,compiled.stderr);
    assert.equal(compiled.stdout,native.stdout);
  });
});
