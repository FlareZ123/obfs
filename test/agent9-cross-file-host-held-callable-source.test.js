'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<{stdout:string,source:string,invoked:boolean}>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-file-held-callable-'));
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
      'globalThis.ARM_HOST_OBSERVER=function(){',
      '  globalThis.queueMicrotask=function(callback){',
      '    const source=Function.prototype.toString.call(callback);',
      "    fs.writeFileSync(process.env.OBFS_CROSS_FILE_OBSERVATION,JSON.stringify({source,invoked:false}));",
      '  };',
      '};'
    ].join('\n');
    const preloadPath=path.join(dir,'preload.cjs');
    await atomicWrite(preloadPath,preload);
    const child=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(dir,'entry.mjs')],{
        encoding:'utf8',
        timeout:15000,
        env:{...process.env,OBFS_CROSS_FILE_OBSERVATION:observationPath}
      });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    const observation=JSON.parse(await fs.readFile(observationPath,'utf8'));
    return {stdout:child.stdout.trim(),source:observation.source,invoked:observation.invoked};
  }finally{
    await fs.rm(dir,{force:true,recursive:true});
  }
}

const entry={
  path:'entry.mjs',sourceType:'module',
  code:[
    "import {getCallback} from './helper.mjs';",
    'ARM_HOST_OBSERVER();',
    'queueMicrotask(getCallback());',
    "console.log('done');"
  ].join('\n')
};

for(const mode of /** @type {const} */ (['coo','sco','sno'])){
  test(mode+' cross-file red control: imported factory return leaks private callback parameter source',async()=>{
    const helper={
      path:'helper.mjs',sourceType:'module',
      code:[
        'function hidden(inputValue){return inputValue+1;}',
        'export function getCallback(){return hidden;}'
      ].join('\n')
    };
    const native=await execute([entry,helper]);
    assert.equal(native.stdout,'done');
    assert.equal(native.source,'function hidden(inputValue){return inputValue+1;}');
    assert.equal(native.invoked,false);
    const compiled=obfuscateFiles([entry,helper],{
      mode,closedWorld:true,seed:'agent9-cross-file-held-identifier-'+mode,
      identifiers:true,strings:false,properties:false
    });
    const transformed=await execute(compiled.files);
    assert.notEqual(transformed.source,native.source);
    assert.equal(transformed.stdout,native.stdout);
    assert.equal(transformed.invoked,false);
    console.log('AGENT9_CROSS_FILE_HELD_IDENTIFIER '+JSON.stringify({
      mode,native:native.source,emitted:transformed.source
    }));
  });

  test(mode+' cross-file red control: imported factory return leaks private callback string source',async()=>{
    const helper={
      path:'helper.mjs',sourceType:'module',
      code:[
        "function hidden(){return 'callbackSourceLiteral';}",
        'export function getCallback(){return hidden;}'
      ].join('\n')
    };
    const native=await execute([entry,helper]);
    assert.equal(native.stdout,'done');
    assert.equal(native.source,"function hidden(){return 'callbackSourceLiteral';}");
    assert.equal(native.invoked,false);
    const compiled=obfuscateFiles([entry,helper],{
      mode,closedWorld:true,seed:'agent9-cross-file-held-string-'+mode,
      identifiers:false,strings:true,properties:false
    });
    const transformed=await execute(compiled.files);
    assert.notEqual(transformed.source,native.source);
    assert.equal(transformed.stdout,native.stdout);
    assert.equal(transformed.invoked,false);
    console.log('AGENT9_CROSS_FILE_HELD_STRING '+JSON.stringify({
      mode,native:native.source,emitted:transformed.source
    }));
  });
}
