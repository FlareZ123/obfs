'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {createSnoLauncher}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Run a SNO artifact with the actual Node loader and await exported promises.
 * @param {string} entry
 * @param {string[]} [flags]
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function run(entry,flags=[]) {
  const script='Promise.resolve(require(process.argv[1]))'+
    '.then(value=>process.stdout.write(JSON.stringify(value)))'+
    '.catch(error=>{console.error(error);process.exitCode=1;});';
  return spawnSync(process.execPath,[...flags,'-e',script,entry],{
    encoding:'utf8',timeout:15000
  });
}

/**
 * @param {(dir:string)=>Promise<void>} work
 * @returns {Promise<void>}
 */
async function fixture(work) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-runtime-scope-'));
  try {await work(dir);}
  finally{await fs.rm(dir,{recursive:true,force:true});}
}

test('relocated SNO .js fails before running under a different ESM package scope',async()=>{
  await fixture(async dir=>{
    const input=path.join(dir,'source');
    const output=path.join(dir,'output');
    const host=path.join(dir,'esm-host');
    await atomicWrite(path.join(input,'entry.js'),'module.exports=314;');
    await main('sno',['--root',input,'--entry','entry.js','--out',output,
      '--seed','runtime-relocation-protection']);

    const original=run(path.join(output,'sno-entry.cjs'));
    assert.equal(original.status,0,original.stderr);
    assert.equal(original.stdout,'314');
    const before=await fs.readFile(path.join(output,'entry.js'));

    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await fs.rename(output,path.join(host,'distribution'));
    const relocated=path.join(host,'distribution');
    assert.deepEqual(await fs.readFile(path.join(relocated,'entry.js')),before);

    const rejected=run(path.join(relocated,'sno-entry.cjs'));
    assert.notEqual(rejected.status,0);
    assert.match(rejected.stderr,/SNO runtime package-scope mismatch: entry\.js/u);
    assert.doesNotMatch(rejected.stderr,/Integrity check failed/u);
  });
});

test('packaged nested ESM retains native semantics after SNO relocation',async()=>{
  await fixture(async dir=>{
    const input=path.join(dir,'source');
    const output=path.join(dir,'output');
    const host=path.join(dir,'esm-host');
    await atomicWrite(path.join(input,'entry.cjs'),
      "module.exports=import('./nested/value.js').then(mod=>mod.value);");
    await atomicWrite(path.join(input,'nested','package.json'),'{"type":"module"}');
    await atomicWrite(path.join(input,'nested','value.js'),'export const value=271;');
    await main('sno',['--root',input,'--entry','entry.cjs','--out',output,
      '--seed','runtime-relocation-packaged-positive']);
    assert.equal(run(path.join(output,'sno-entry.cjs')).stdout,'271');

    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await fs.rename(output,path.join(host,'distribution'));
    const result=run(path.join(host,'distribution','sno-entry.cjs'));
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,'271');
  });
});

test('SNO direct launcher without declared sourceType retains legacy manifest shape',()=>{
  const raw=createSnoLauncher([{path:'entry.js',code:'module.exports=41;'}],'entry.js');
  assert.doesNotMatch(raw,/SNO runtime package-scope mismatch/u);
  const proved=createSnoLauncher([{
    path:'entry.js',code:'module.exports=41;',sourceType:'script'
  }],'entry.js');
  assert.match(proved,/SNO runtime package-scope mismatch/u);
  assert.throws(()=>createSnoLauncher([{
    path:'entry.js',code:'module.exports=41;',
    sourceType:/** @type {any} */ ('unknown')
  }],'entry.js'),/invalid sourceType/u);
});

test('SNO runtime check identifies --preserve-symlinks package-context divergence',async t=>{
  await fixture(async dir=>{
    const input=path.join(dir,'source');
    const real=path.join(dir,'neutral');
    const host=path.join(dir,'esm-host');
    const alias=path.join(host,'alias');
    await atomicWrite(path.join(input,'entry.js'),'module.exports=317;');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await fs.mkdir(real,{recursive:true});
    try {await fs.symlink(real,alias,process.platform==='win32'?'junction':'dir');}
    catch(error){
      if(process.platform==='win32'&&['EPERM','EACCES'].includes(
        /** @type {NodeJS.ErrnoException} */(error).code||'')) {
        t.skip('Junction creation unavailable on this Windows runner');
        return;
      }
      throw error;
    }
    const output=path.join(alias,'dist');
    await main('sno',['--root',input,'--entry','entry.js','--out',output,
      '--seed','runtime-preserve-symlinks']);
    const loader=path.join(output,'sno-entry.cjs');
    const native=run(loader);
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'317');

    const flagged=run(loader,['--preserve-symlinks']);
    assert.notEqual(flagged.status,0);
    assert.match(flagged.stderr,/SNO runtime package-scope mismatch: entry\.js/u);
    assert.doesNotMatch(flagged.stderr,/Integrity check failed/u);
    
    // --preserve-symlinks-main retains the launcher alias, but ordinary
    // require() still canonicalizes the nested entry.js dependency.
    const mainOnly=spawnSync(process.execPath,
      ['--preserve-symlinks-main',loader],{encoding:'utf8',timeout:15000});
    assert.equal(mainOnly.status,0,mainOnly.stderr);

    // Both options retain the dependency alias and must be refused.
    const both=spawnSync(process.execPath,
      ['--preserve-symlinks','--preserve-symlinks-main',loader],
      {encoding:'utf8',timeout:15000});
    assert.notEqual(both.status,0);
    assert.match(both.stderr,/SNO runtime package-scope mismatch: entry\.js/u);
  });
});
