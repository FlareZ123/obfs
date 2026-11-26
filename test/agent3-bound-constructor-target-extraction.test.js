'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */

const constructibleSources=[{
  path:'app.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:7};',
    'function internal(){return owner.secretField;}',
    'export const hot=internal.bind(null);'
  ].join('\\n')
}];

/**
 * Recover the bound target through the instance prototype created by new hot().
 * @param {Source[]} files
 * @returns {Promise<{result:number,source:string,recoveredName:string,wrapperName:string,wrapperLength:number}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bound-constructor-target-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const script=[
      'const {hot}=await import(process.argv[1]);',
      'const instance=new hot();',
      'const recovered=Object.getPrototypeOf(instance).constructor;',
      'const source=Function.prototype.toString.call(recovered);',
      'const result=recovered();',
      'process.stdout.write(JSON.stringify({result,source,recoveredName:recovered.name,wrapperName:hot.name,wrapperLength:hot.length}));'
    ].join('\\n');
    const child=spawnSync(process.execPath,[
      '--input-type=module','-e',script,pathToFileURL(path.join(root,'app.mjs')).href
    ],{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{result:number,source:string,recoveredName:string,wrapperName:string,wrapperLength:number}} */(JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' constructible bound wrapper exposes its private target via prototype.constructor',async()=>{
    const native=await run(constructibleSources);
    assert.equal(native.result,7);
    assert.match(native.source,/owner\\.secretField/u);
    assert.equal(native.recoveredName,'internal');
    assert.equal(native.wrapperName,'bound internal');

    const compiled=obfuscateFiles(constructibleSources,{
      mode,closedWorld:true,seed:'agent3-bound-constructor-extraction-'+mode,
      properties:true,identifiers:true,strings:false
    });
    const app=compiled.files.find(file=>file.path==='app.mjs');
    assert.ok(app);
    assert.equal(app.metrics.properties,1,
      JSON.stringify({mode,metrics:app.metrics,source:app.code}));

    const actual=await run(compiled.files.map(file=>({
      path:file.path,sourceType:'module',code:String(file.code)
    })));
    process.stdout.write('BOUND_CONSTRUCTOR_TARGET_EXTRACTION '+JSON.stringify({
      mode,native,actual,properties:app.metrics.properties,emittedSource:app.code
    })+'\\n');

    assert.equal(actual.result,7,'the extracted target still computes the original value');
    assert.match(actual.source,/_p[0-9a-f]{10}/u,
      'the recovered target source contains the transformed property key');
    assert.doesNotMatch(actual.source,/secretField/u,
      'the ordinary constructor path extracts transformed, not original, source');
    assert.notEqual(actual.source,native.source,
      'the constructor path exposes the changed target source without a host preloader');
  });
}
