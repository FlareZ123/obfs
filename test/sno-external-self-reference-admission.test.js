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

test('SNO refuses external input package self-reference before publication',async()=>{
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
    await assert.rejects(
      main('sno',['--root',source,'--entry','entry.cjs','--out',output]),
      /SNO input executable inherits external package self-reference/
    );
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  });
});

test('SNO refuses external output package named exports for unscoped .cjs',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const host=path.join(root,'host');
    const output=path.join(host,'distribution');
    await atomicWrite(path.join(source,'entry.cjs'),'module.exports=149;');
    await atomicWrite(path.join(host,'package.json'),
      JSON.stringify({name:'scope-pkg',type:'commonjs',exports:{'./value':'./foreign.cjs'}}));
    const native=run(path.join(source,'entry.cjs'));
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'149');
    await assert.rejects(
      main('sno',['--root',source,'--entry','entry.cjs','--out',output]),
      /SNO output executable inherits external package self-reference/
    );
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  });
});

test('external exports without a package name does not alter self-reference',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const host=path.join(root,'host');
    const output=path.join(host,'distribution');
    await atomicWrite(path.join(source,'entry.cjs'),'module.exports=151;');
    await atomicWrite(path.join(host,'package.json'),
      JSON.stringify({type:'commonjs',exports:{'./value':'./foreign.cjs'}}));
    const native=run(path.join(source,'entry.cjs'));
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'151');
    await main('sno',['--root',source,'--entry','entry.cjs','--out',output]);
    const compiled=run(path.join(output,'sno-entry.cjs'));
    assert.equal(compiled.status,0,compiled.stderr);
    assert.equal(compiled.stdout,native.stdout);
  });
});
