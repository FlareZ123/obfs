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
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-self-exports-'));
  try { await callback(root); }
  finally { await fs.rm(root,{recursive:true,force:true}); }
}

/** @param {string} entry @returns {import('node:child_process').SpawnSyncReturns<string>} */
function run(entry) {
  return spawnSync(process.execPath,
    ['--eval','process.stdout.write(String(require(process.argv[1])))',entry],
    {encoding:'utf8',timeout:15000});
}

test('control: included package name and exports retains SNO self-reference',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const output=path.join(root,'distribution');
    await atomicWrite(path.join(source,'package.json'),
      JSON.stringify({type:'commonjs',name:'scope-pkg',exports:{'./value':'./value.cjs'}}));
    await atomicWrite(path.join(source,'entry.cjs'),
      "module.exports=require('scope-pkg/value');");
    await atomicWrite(path.join(source,'value.cjs'),'module.exports=137;');

    const native=run(path.join(source,'entry.cjs'));
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'137');
    await main('sno',['--root',source,'--entry','entry.cjs','--out',output]);
    const compiled=run(path.join(output,'sno-entry.cjs'));
    assert.equal(compiled.status,0,compiled.stderr);
    assert.equal(compiled.stdout,native.stdout);
  });
});

test('RED: external package self-reference exports differ across output host',async()=>{
  await withFixture(async root=>{
    const inputHost=path.join(root,'source-host');
    const source=path.join(inputHost,'source');
    const outputHost=path.join(root,'output-host');
    const output=path.join(outputHost,'distribution');
    await atomicWrite(path.join(inputHost,'package.json'),JSON.stringify({
      type:'commonjs',name:'scope-pkg',exports:{'./value':'./source/value.cjs'}
    }));
    await atomicWrite(path.join(source,'entry.cjs'),
      "module.exports=require('scope-pkg/value');");
    await atomicWrite(path.join(source,'value.cjs'),'module.exports=137;');
    await atomicWrite(path.join(outputHost,'package.json'),JSON.stringify({
      type:'commonjs',name:'scope-pkg',exports:{'./value':'./foreign.cjs'}
    }));
    await atomicWrite(path.join(outputHost,'foreign.cjs'),'module.exports=139;');

    const native=run(path.join(source,'entry.cjs'));
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'137');
    await main('sno',['--root',source,'--entry','entry.cjs','--out',output]);
    const compiled=run(path.join(output,'sno-entry.cjs'));
    assert.equal(compiled.status,0,compiled.stderr);
    assert.equal(compiled.stdout,native.stdout,
      'SNO relocated external package self-reference must preserve resolution');
  });
});
