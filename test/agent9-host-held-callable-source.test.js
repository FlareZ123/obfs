'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string|Buffer}} OutputFile */

const sourceFile={
  path:'entry.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:41};',
    'const other={unrelatedField:7};',
    'function hidden(){return owner.secretField;}',
    'function plain(){return other.unrelatedField;}',
    'queueMicrotask(hidden);',
    'console.log(plain());'
  ].join('\n')
};

/**
 * A preloaded host replaces queueMicrotask with a non-invoking observer. It
 * reads the callback's source and never calls the callback, isolating a
 * HostHeldCallable edge from any ActiveFrame edge.
 * @param {ReadonlyArray<OutputFile>} files
 * @returns {Promise<{stdout:string,source:string,invoked:boolean}>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-held-callable-'));
  try{
    for(const file of files){
      const destination=path.join(dir,file.path);
      await fs.mkdir(path.dirname(destination),{recursive:true});
      await atomicWrite(destination,file.code);
    }
    const observationPath=path.join(dir,'observation.json');
    const preload=[
      "'use strict';",
      "const fs=require('node:fs');",
      'globalThis.queueMicrotask=function(callback){',
      '  const source=Function.prototype.toString.call(callback);',
      "  fs.writeFileSync(process.env.OBFS_HOST_HELD_OBSERVATION,JSON.stringify({source,invoked:false}));",
      '};'
    ].join('\n');
    const preloadPath=path.join(dir,'preload.cjs');
    await atomicWrite(preloadPath,preload);
    const child=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(dir,'entry.mjs')],{
        encoding:'utf8',
        timeout:15000,
        env:{...process.env,OBFS_HOST_HELD_OBSERVATION:observationPath}
      });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    const observation=JSON.parse(await fs.readFile(observationPath,'utf8'));
    return {stdout:child.stdout.trim(),source:observation.source,invoked:observation.invoked};
  }finally{
    await fs.rm(dir,{force:true,recursive:true});
  }
}

test('unknown host callback argument preserves exact callable source without invocation',async()=>{
  const native=await execute([sourceFile]);
  assert.equal(native.stdout,'7');
  assert.equal(native.source,'function hidden(){return owner.secretField;}');
  assert.equal(native.invoked,false);

  const compiled=obfuscateFiles([sourceFile],{
    mode:'coo',
    closedWorld:true,
    seed:'agent9-host-held-callable-source',
    strings:false,
    identifiers:false,
    properties:true
  });
  const emitted=compiled.files.find(file=>file.path==='entry.mjs');
  assert.ok(emitted,'COO output must contain entry.mjs');
  assert.ok(emitted.metrics.properties>=1,
    'unrelated private owner must retain useful property-rewrite yield');
  assert.ok(emitted.code.includes('secretField'),
    'host-held callback source must retain the observed owner key');
  assert.ok(!emitted.code.includes('unrelatedField'),
    'unrelated proven owner key should still be rewritten');

  const transformed=await execute(compiled.files);
  assert.equal(transformed.stdout,native.stdout);
  assert.equal(transformed.source,native.source,
    'a host may inspect a callable argument without invoking it or observing an active frame');
  assert.equal(transformed.invoked,false);
});
