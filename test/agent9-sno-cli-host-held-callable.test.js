'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

test('SNO CLI emits a single-entry launcher whose host-held callback source is mutated',{
  timeout:30000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-cli-host-held-'));
  try{
    const input=path.join(root,'input');
    const output=path.join(root,'output');
    await fs.mkdir(input,{recursive:true});
    const source=[
      'function hidden(inputValue){return inputValue+1;}',
      'queueMicrotask(hidden);',
      'module.exports=0;',
      "console.log('done');"
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
      bin,'--root',input,'--out',output,'--entry','entry.cjs','--seed','agent9-sno-cli-host-held'
    ],{encoding:'utf8',timeout:20000});
    if(compile.error)throw compile.error;
    assert.equal(compile.status,0,compile.stderr);
    assert.match(compile.stdout,/mode sno/u);
    assert.equal(await fs.stat(path.join(output,'sno-entry.cjs')).then(()=>true),true);

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
    assert.equal(native.stdout.trim(),'done');
    assert.equal(transformed.stdout.trim(),'done');
    assert.equal(nativeObservation.source,'function hidden(inputValue){return inputValue+1;}');
    assert.notEqual(emittedObservation.source,nativeObservation.source);
    assert.equal(nativeObservation.invoked,false);
    assert.equal(emittedObservation.invoked,false);
    console.log('AGENT9_SNO_CLI_HOST_HELD '+JSON.stringify({
      native:nativeObservation.source,emitted:emittedObservation.source,
      callbackInvoked:emittedObservation.invoked,compiled:compile.stdout.trim()
    }));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});


test('SNO CLI packages a multi-file factory-return callback behind one entrypoint',{
  timeout:30000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-cli-multifile-held-'));
  try{
    const input=path.join(root,'input');
    const output=path.join(root,'output');
    await fs.mkdir(input,{recursive:true});
    const helper=[
      'function createHidden(){',
      '  return function hidden(inputValue){return inputValue+1;};',
      '}',
      'module.exports={createHidden};'
    ].join('\n');
    const entry=[
      "const {createHidden}=require('./helper.cjs');",
      'const hidden=createHidden();',
      'queueMicrotask(hidden);',
      'module.exports=0;',
      "console.log('done');"
    ].join('\n');
    await atomicWrite(path.join(input,'helper.cjs'),helper);
    await atomicWrite(path.join(input,'entry.cjs'),entry);
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
      bin,'--root',input,'--out',output,'--entry','entry.cjs','--seed','agent9-sno-cli-multifile-held'
    ],{encoding:'utf8',timeout:20000});
    if(compile.error)throw compile.error;
    assert.equal(compile.status,0,compile.stderr);
    assert.match(compile.stdout,/Processed 2 files; mode sno/u);
    const helperOutput=await fs.readFile(path.join(output,'helper.cjs'),'utf8');
    const entryOutput=await fs.readFile(path.join(output,'entry.cjs'),'utf8');
    const launcher=await fs.readFile(path.join(output,'sno-entry.cjs'),'utf8');
    assert.ok(helperOutput.length>0);
    assert.ok(entryOutput.length>0);
    assert.match(launcher,/"entry.cjs"/u);
    assert.match(launcher,/"helper.cjs"/u);
    assert.match(launcher,/module\.exports=require\(path\.join\(__dirname,"entry\.cjs"\)\)/u);
    assert.doesNotMatch(launcher,/module\.exports=require\(path\.join\(__dirname,"helper\.cjs"\)\)/u);

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
    assert.equal(native.stdout.trim(),'done');
    assert.equal(transformed.stdout.trim(),'done');
    assert.equal(nativeObservation.source,'function hidden(inputValue){return inputValue+1;}');
    assert.notEqual(emittedObservation.source,nativeObservation.source);
    assert.equal(nativeObservation.invoked,false);
    assert.equal(emittedObservation.invoked,false);
    console.log('AGENT9_SNO_CLI_MULTIFILE_HOST_HELD '+JSON.stringify({
      native:nativeObservation.source,emitted:emittedObservation.source,
      helperIncluded:true,soleEntry:'entry.cjs',callbackInvoked:emittedObservation.invoked
    }));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
