'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {(root:string)=>Promise<void>} callback
 * @returns {Promise<void>}
 */
async function withFixture(callback) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-imports-relocation-'));
  try { await callback(root); }
  finally { await fs.rm(root,{recursive:true,force:true}); }
}

/**
 * @param {string} entry
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function run(entry) {
  return spawnSync(process.execPath,
    ['--eval','process.stdout.write(String(require(process.argv[1])))',entry],
    {encoding:'utf8',timeout:15000});
}

test('control: packaged SNO #imports mapping keeps dependency resolution',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const output=path.join(root,'distribution');
    await atomicWrite(path.join(source,'package.json'),
      JSON.stringify({type:'commonjs',imports:{'#target':'./target.cjs'}}));
    await atomicWrite(path.join(source,'entry.cjs'),"module.exports=require('#target');");
    await atomicWrite(path.join(source,'target.cjs'),'module.exports=103;');

    const native=run(path.join(source,'entry.cjs'));
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'103');
    await main('sno',['--root',source,'--entry','entry.cjs','--out',output]);
    const compiled=run(path.join(output,'sno-entry.cjs'));
    assert.equal(compiled.status,0,compiled.stderr);
    assert.equal(compiled.stdout,native.stdout);
  });
});

test('external input package #imports mapping refuses before SNO publication',async()=>{
  await withFixture(async root=>{
    const inputHost=path.join(root,'input-host');
    const source=path.join(inputHost,'source');
    const outputHost=path.join(root,'output-host');
    const output=path.join(outputHost,'distribution');
    await atomicWrite(path.join(inputHost,'package.json'),JSON.stringify({
      type:'commonjs',imports:{'#target':'./source/target.cjs'}
    }));
    await atomicWrite(path.join(source,'entry.cjs'),"module.exports=require('#target');");
    await atomicWrite(path.join(source,'target.cjs'),'module.exports=103;');
    await atomicWrite(path.join(outputHost,'package.json'),JSON.stringify({
      type:'commonjs',imports:{'#target':'./foreign.cjs'}
    }));
    await atomicWrite(path.join(outputHost,'foreign.cjs'),'module.exports=107;');

    const native=run(path.join(source,'entry.cjs'));
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'103');
    await assert.rejects(
      main('sno',['--root',source,'--entry','entry.cjs','--out',output]),
      /SNO input executable inherits external package imports/
    );
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  });
});

test('external output package #imports mapping refuses even when source has none',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const outputHost=path.join(root,'host');
    const output=path.join(outputHost,'distribution');
    await atomicWrite(path.join(source,'entry.cjs'),'module.exports=109;');
    await atomicWrite(path.join(outputHost,'package.json'),JSON.stringify({
      type:'commonjs',imports:{'#target':'./foreign.cjs'}
    }));
    const native=run(path.join(source,'entry.cjs'));
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'109');
    await assert.rejects(
      main('sno',['--root',source,'--entry','entry.cjs','--out',output]),
      /SNO output executable inherits external package imports/
    );
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  });
});

test('stale nested output package #imports mapping refuses',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const output=path.join(root,'distribution');
    await atomicWrite(path.join(source,'nested','entry.cjs'),'module.exports=113;');
    await atomicWrite(path.join(output,'nested','package.json'),JSON.stringify({
      type:'commonjs',imports:{'#target':'./foreign.cjs'}
    }));
    await assert.rejects(
      main('sno',['--root',source,'--entry','nested/entry.cjs','--out',output]),
      /SNO output executable inherits external package imports/
    );
    await assert.rejects(fs.stat(path.join(output,'nested','entry.cjs')),{code:'ENOENT'});
  });
});

test('external imports metadata under an ESM dependency refuses SNO',async()=>{
  await withFixture(async root=>{
    const source=path.join(root,'source');
    const output=path.join(root,'output');
    const loader="require(process.argv[1]).then(value=>process.stdout.write(String(value))).catch(error=>{console.error(error);process.exitCode=1;});";
    await atomicWrite(path.join(source,'entry.cjs'),
      "module.exports=import('./modern/value.mjs').then(mod=>mod.value);");
    await atomicWrite(path.join(source,'modern','value.mjs'),'export const value=131;');
    await atomicWrite(path.join(output,'modern','package.json'),JSON.stringify({
      imports:{'#token':'./different.mjs'}
    }));

    const native=spawnSync(process.execPath,['--eval',loader,
      path.join(source,'entry.cjs')],{encoding:'utf8',timeout:15000});
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'131');
    await assert.rejects(
      main('sno',['--root',source,'--entry','entry.cjs','--out',output]),
      /SNO output executable inherits external package imports/
    );
    await assert.rejects(fs.stat(path.join(output,'modern','value.mjs')),{code:'ENOENT'});
  });
});
