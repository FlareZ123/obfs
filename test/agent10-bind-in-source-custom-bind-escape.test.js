'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

const source=[
  'const owner={secretField:7};',
  'const nativeBind=Function.prototype.bind;',
  'Function.prototype.bind=function(...args){',
  '  globalThis.external(this);',
  '  const target=this;',
  '  return (...callArgs)=>Reflect.apply(target,args[0],callArgs);',
  '};',
  'const internal=()=>owner.secretField;',
  'const hot=internal.bind(null);',
  'const result=hot();',
  'Function.prototype.bind=nativeBind;',
  'process.stdout.write(JSON.stringify([globalThis.__capturedSource,result]));'
].join('\n');

const preloader=[
  'globalThis.__capturedSource=null;',
  'globalThis.external=function(value){',
  '  globalThis.__capturedSource=Function.prototype.toString.call(value);',
  '};'
].join('\n');

/**
 * Run the source under the declared host callback that captures the function
 * receiver passed through the source-level custom bind implementation.
 * @param {string} code
 * @returns {Promise<[string,number]>}
 */
async function run(code){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-source-custom-bind-'));
  try{
    const entry=path.join(root,'entry.mjs');
    const preload=path.join(root,'preload.cjs');
    await fs.writeFile(entry,code);
    await fs.writeFile(preload,preloader);
    const child=spawnSync(process.execPath,['--require',preload,entry],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {[string,number]} */(JSON.parse(child.stdout.trim()));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' refuses bound-reader rewrite when analyzed source replaces bind and exposes this to host',async()=>{
    const native=await run(source);
    const emitted=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
      mode,closedWorld:true,seed:'source-custom-bind-opaque-this-'+mode,
      properties:true,identifiers:false,strings:false
    });
    const file=emitted.files[0];
    assert.ok(file);
    const actual=await run(file.code);
    process.stdout.write('SOURCE_CUSTOM_BIND_ESCAPE_WITNESS '+JSON.stringify({
      mode,properties:file.metrics.properties,
      nativeSource:native[0],transformedSource:actual[0],
      nativeResult:native[1],transformedResult:actual[1]
    })+'\n');
    assert.equal(file.metrics.properties,0,
      mode+': an in-source bind replacement passes the target function as this to an opaque host callback');
    assert.deepEqual(actual,native,
      mode+': source-level host observation is part of this program contract');
  });
}
