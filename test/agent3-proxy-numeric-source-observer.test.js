'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const patcher=[
  'const original=Function.prototype.toString;',
  'globalThis.__functionSources=[];',
  'Function.prototype.toString=function(){',
  '  const source=original.call(this);',
  '  globalThis.__functionSources.push(source);',
  '  return source;',
  '};'
].join('\n');

/** @param {string} code @returns {Promise<{capturedSource:string,result:boolean}>} */
async function run(code){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-proxy-to-primitive-'));
  try{
    const patcherPath=path.join(root,'patcher.mjs');
    await fs.writeFile(patcherPath,patcher);
    await atomicWrite(path.join(root,'app.mjs'),code);
    const entryUrl=pathToFileURL(path.join(root,'app.mjs')).href;
    const patcherUrl=pathToFileURL(patcherPath).href;
    const command='import('+JSON.stringify(entryUrl)+').then(m=>console.log(JSON.stringify({capturedSource:m.capturedSource,result:m.result}))).catch(e=>{console.error(e);process.exitCode=1});';
    const child=spawnSync(process.execPath,['--import',patcherUrl,'--input-type=module','-e',command],{
      cwd:root,encoding:'utf8'
    });
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout.trim());
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('function Proxy forwarded primitive conversion preserves target source',async()=>{
  const source=[
    "function reader(secretValue){return secretValue+1;}",
    "const proxied=new Proxy(reader,{get(target,key,receiver){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});",
    "globalThis.__functionSources.length=0;",
    "export const result=Number.isNaN(+proxied);",
    "export const capturedSource=globalThis.__functionSources[0]??'';"
  ].join('\n');
  const output=obfuscateFiles([{path:'app.mjs',code:source}],{
    mode:'coo',seed:'proxy-numeric-source-observer',properties:false,
    strings:false,identifiers:true
  }).files[0];
  const native=await run(source);
  const transformed=await run(output.code);
  assert.equal(output.metrics.bindings,0,
    'proxy-mediated ToPrimitive must fail closed until its source target is scoped');
  assert.equal(output.code,source);
  assert.equal(native.result,true);
  assert.equal(transformed.result,true);
  assert.ok(native.capturedSource.includes('secretValue'));
  assert.equal(transformed.capturedSource,native.capturedSource,
    'a proxy that forwards ToPrimitive to the target must not expose renamed source');
});
