'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

// Intentional current-main red control: a future shared-plan fix should invert
// the source-mismatch assertion to require exact callback-source parity.
test('SNO CLI string encoding mutates source held by a non-invoking host callback',{
  timeout:30000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-cli-host-held-string-'));
  try{
    const input=path.join(root,'input');
    const output=path.join(root,'output');
    await fs.mkdir(input,{recursive:true});
    const source=[
      "function hidden(){return 'callbackSourceLiteral';}",
      'queueMicrotask(hidden);',
      'console.log(hidden());'
    ].join('\n');
    await atomicWrite(path.join(input,'entry.cjs'),source);
    const observationPath=path.join(root,'observation.json');
    const preload=[
      "'use strict';",
      "const fs=require('node:fs');",
      'globalThis.queueMicrotask=function(callback){',
      '  const source=Function.prototype.toString.call(callback);',
      "  fs.writeFileSync(process.env.OBFS_SNO_CLI_OBSERVATION,JSON.stringify({source,invoked:false}));",
      '};'
    ].join('\n');
    const preloadPath=path.join(root,'preload.cjs');
    await atomicWrite(preloadPath,preload);
    const bin=path.join(process.cwd(),'bin','sno.js');
    const compile=spawnSync(process.execPath,[
      bin,'--root',input,'--out',output,'--entry','entry.cjs','--seed','agent24-sno-cli-host-held-string'
    ],{encoding:'utf8',timeout:20000});
    if(compile.error)throw compile.error;
    assert.equal(compile.status,0,compile.stderr);
    assert.match(compile.stdout,/Processed 1 files; mode sno/u);
    assert.ok(await fs.stat(path.join(output,'sno-entry.cjs')));

    const native=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(input,'entry.cjs')],{
        encoding:'utf8',timeout:15000,
        env:{...process.env,OBFS_SNO_CLI_OBSERVATION:observationPath}
      });
    if(native.error)throw native.error;
    assert.equal(native.status,0,native.stderr);
    const nativeObservation=JSON.parse(await fs.readFile(observationPath,'utf8'));

    await fs.rm(observationPath,{force:true});
    const transformed=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(output,'sno-entry.cjs')],{
        encoding:'utf8',timeout:15000,
        env:{...process.env,OBFS_SNO_CLI_OBSERVATION:observationPath}
      });
    if(transformed.error)throw transformed.error;
    assert.equal(transformed.status,0,transformed.stderr);
    const emittedObservation=JSON.parse(await fs.readFile(observationPath,'utf8'));

    assert.equal(native.stdout.trim(),'callbackSourceLiteral');
    assert.equal(transformed.stdout.trim(),native.stdout.trim());
    assert.equal(nativeObservation.source,
      "function hidden(){return 'callbackSourceLiteral';}");
    assert.ok(nativeObservation.source.includes('callbackSourceLiteral'));
    assert.ok(!emittedObservation.source.includes('callbackSourceLiteral'),
      'SNO CLI string encoding must be visible in the host-observed callback source');
    assert.equal(nativeObservation.invoked,false);
    assert.equal(emittedObservation.invoked,false);
    console.log('AGENT24_SNO_CLI_HOST_HELD_STRING '+JSON.stringify({
      native:nativeObservation.source,
      emitted:emittedObservation.source,
      callbackInvoked:emittedObservation.invoked,
      compile:compile.stdout.trim()
    }));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
