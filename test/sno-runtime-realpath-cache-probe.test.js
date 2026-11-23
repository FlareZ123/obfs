'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{canonical:string,resolved:string,unchangedRealpath:boolean,changedResolve:boolean,beforeCount:number,afterCount:number}} Probe */

/**
 * Test both candidate primitives in a pristine Node process without
 * ever executing target application source.
 *
 * @param {string} filename
 * @param {string[]} flags
 * @returns {Probe}
 */
function probe(filename,flags) {
  const script=[
    "const fs=require('node:fs');",
    "const Module=require('node:module');",
    "const target=process.argv[1];",
    "const before=JSON.stringify(Module._pathCache);",
    "const beforeCount=Object.keys(Module._pathCache).length;",
    "const canonical=fs.realpathSync(target);",
    "const afterRealpath=JSON.stringify(Module._pathCache);",
    "const resolved=require.resolve(target);",
    "const afterResolve=JSON.stringify(Module._pathCache);",
    "const afterCount=Object.keys(Module._pathCache).length;",
    "process.stdout.write(JSON.stringify({canonical,resolved,",
    "unchangedRealpath:afterRealpath===before,",
    "changedResolve:afterResolve!==afterRealpath,beforeCount,afterCount}));"
  ].join('');
  const result=spawnSync(process.execPath,[...flags,'--eval',script,filename],{
    encoding:'utf8',timeout:15000
  });
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);
  return /** @type {Probe} */ (JSON.parse(result.stdout));
}

test('fs.realpathSync preserves Module._pathCache; require.resolve changes it',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-realpath-probe-'));
  try {
    const file=path.join(dir,'entry.js');
    await atomicWrite(file,'module.exports=71;');
    const result=probe(file,[]);
    assert.equal(result.canonical,result.resolved);
    assert.equal(result.unchangedRealpath,true);
    assert.equal(result.changedResolve,true);
    assert.ok(result.afterCount>result.beforeCount);
  }finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('symlink loader flags select different Node-resolved paths while realpath stays canonical',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-realpath-flags-'));
  try {
    const real=path.join(dir,'actual');
    const host=path.join(dir,'esm-host');
    const alias=path.join(host,'link');
    await atomicWrite(path.join(real,'entry.js'),'module.exports=72;');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await fs.mkdir(host,{recursive:true});
    try {await fs.symlink(real,alias,process.platform==='win32'?'junction':'dir');}
    catch(error) {
      if(process.platform==='win32'&&['EPERM','EACCES'].includes(
        /** @type {NodeJS.ErrnoException} */(error).code||'')) {
        t.skip('Windows junction creation unavailable');
        return;
      }
      throw error;
    }
    const file=path.join(alias,'entry.js');
    for(const flags of [
      [],['--preserve-symlinks-main'],['--preserve-symlinks'],
      ['--preserve-symlinks','--preserve-symlinks-main']
    ]) {
      const output=probe(file,flags);
      assert.equal(output.unchangedRealpath,true,flags.join(' '));
      assert.equal(output.changedResolve,true,flags.join(' '));
      assert.equal(output.canonical,path.join(real,'entry.js'));
      if(flags.includes('--preserve-symlinks')) {
        assert.equal(output.resolved,file);
        assert.notEqual(output.resolved,output.canonical);
      }else{
        assert.equal(output.resolved,output.canonical);
      }
    }
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('NODE_OPTIONS may change effective symlink loader semantics without process.execArgv',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-realpath-env-'));
  try {
    const real=path.join(dir,'actual');
    const host=path.join(dir,'esm-host');
    const alias=path.join(host,'link');
    await atomicWrite(path.join(real,'entry.js'),'module.exports=73;');
    await fs.mkdir(host,{recursive:true});
    try {await fs.symlink(real,alias,process.platform==='win32'?'junction':'dir');}
    catch(error) {
      if(process.platform==='win32'&&['EPERM','EACCES'].includes(
        /** @type {NodeJS.ErrnoException} */(error).code||'')) {
        t.skip('Windows junction creation unavailable');
        return;
      }
      throw error;
    }
    const code="const fs=require('node:fs');const f=process.argv[1];"+
      "process.stdout.write(JSON.stringify({actual:require.resolve(f),"+
      "canonical:fs.realpathSync(f),execArgv:process.execArgv}));";
    const file=path.join(alias,'entry.js');
    const outcome=spawnSync(process.execPath,['-e',code,file],{
      encoding:'utf8',timeout:15000,
      env:{...process.env,NODE_OPTIONS:'--preserve-symlinks'}
    });
    if(outcome.error)throw outcome.error;
    assert.equal(outcome.status,0,outcome.stderr);
    const values=/** @type {{actual:string,canonical:string,execArgv:string[]}} */ (
      JSON.parse(outcome.stdout));
    assert.equal(values.actual,file);
    assert.equal(values.canonical,path.join(real,'entry.js'));
    assert.equal(values.execArgv.includes('--preserve-symlinks'),false,
      'NODE_OPTIONS flags need an independent source of effective options');
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});
