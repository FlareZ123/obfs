'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles,createSnoLauncher}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {string} source
 * @param {string|null} launcher
 * @returns {Promise<{stdout:string,source:string,invoked:boolean}>}
 */
async function execute(source,launcher=null){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-held-callable-'));
  try{
    await atomicWrite(path.join(root,'entry.cjs'),source);
    if(launcher!==null)await atomicWrite(path.join(root,'sno-entry.cjs'),launcher);
    const observationPath=path.join(root,'observation.json');
    const preload=[
      "'use strict';",
      "const fs=require('node:fs');",
      'globalThis.queueMicrotask=function(callback){',
      '  const source=Function.prototype.toString.call(callback);',
      "  fs.writeFileSync(process.env.OBFS_SNO_HOST_HELD_OBSERVATION,JSON.stringify({source,invoked:false}));",
      '};'
    ].join('\n');
    const preloadPath=path.join(root,'preload.cjs');
    await atomicWrite(preloadPath,preload);
    const entryPath=launcher===null?'entry.cjs':'sno-entry.cjs';
    const child=spawnSync(process.execPath,['--require',preloadPath,path.join(root,entryPath)],{
      encoding:'utf8',timeout:15000,
      env:{...process.env,OBFS_SNO_HOST_HELD_OBSERVATION:observationPath}
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    const observed=JSON.parse(await fs.readFile(observationPath,'utf8'));
    return {stdout:child.stdout.trim(),source:observed.source,invoked:observed.invoked};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('SNO launcher preserves runtime output but exposes identifier mutation in host-held callback source',{
  timeout:30000
},async()=>{
  const source=[
    'function hidden(inputValue){return inputValue+1;}',
    'queueMicrotask(hidden);',
    'module.exports=0;',
    "console.log('done');"
  ].join('\n');
  const native=await execute(source);
  const compiled=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'sno',seed:'agent9-sno-launcher-held-identifier',
    identifiers:true,strings:false,properties:false
  });
  const launcher=createSnoLauncher(compiled.files,'entry.cjs');
  const transformed=await execute(String(compiled.files[0].code),launcher);
  assert.equal(native.stdout,'done');
  assert.equal(transformed.stdout,native.stdout);
  assert.equal(native.source,'function hidden(inputValue){return inputValue+1;}');
  assert.notEqual(transformed.source,native.source);
  assert.equal(native.invoked,false);
  assert.equal(transformed.invoked,false);
  console.log('AGENT9_SNO_LAUNCHER_IDENTIFIER '+JSON.stringify({
    native:native.source,emitted:transformed.source,invoked:transformed.invoked
  }));
});

test('SNO launcher preserves runtime output but exposes string mutation in host-held callback source',{
  timeout:30000
},async()=>{
  const source=[
    "function hidden(){return 'callbackSourceLiteral';}",
    'queueMicrotask(hidden);',
    "module.exports='unrelatedLiteral'.length;",
    "console.log('done');"
  ].join('\n');
  const native=await execute(source);
  const compiled=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'sno',seed:'agent9-sno-launcher-held-string',
    identifiers:false,strings:true,properties:false
  });
  const launcher=createSnoLauncher(compiled.files,'entry.cjs');
  const transformed=await execute(String(compiled.files[0].code),launcher);
  assert.equal(native.stdout,'done');
  assert.equal(transformed.stdout,native.stdout);
  assert.equal(native.source,"function hidden(){return 'callbackSourceLiteral';}");
  assert.notEqual(transformed.source,native.source);
  assert.equal(native.invoked,false);
  assert.equal(transformed.invoked,false);
  console.log('AGENT9_SNO_LAUNCHER_STRING '+JSON.stringify({
    native:native.source,emitted:transformed.source,invoked:transformed.invoked
  }));
});
