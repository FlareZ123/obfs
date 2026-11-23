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
const proxyPackage=[
  'export function wrap(target){',
  '  return new Proxy(target,{get(t,k,r){',
  '    const value=Reflect.get(t,k,t);',
  "    return typeof value==='function'?value.bind(t):value;",
  '  }});',
  '}'
].join('\n');

/** @param {string} code @returns {Promise<{capturedSource:string,result:boolean,unrelatedResult:number}>} */
async function run(code){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-external-proxy-factory-'));
  try{
    const packageDir=path.join(root,'node_modules','proxy-package');
    await fs.mkdir(packageDir,{recursive:true});
    await fs.writeFile(path.join(packageDir,'package.json'),
      JSON.stringify({type:'module',exports:'./index.mjs'}));
    await fs.writeFile(path.join(packageDir,'index.mjs'),proxyPackage);
    const patcherPath=path.join(root,'patcher.mjs');
    await fs.writeFile(patcherPath,patcher);
    await atomicWrite(path.join(root,'app.mjs'),code);
    const entryUrl=pathToFileURL(path.join(root,'app.mjs')).href;
    const patcherUrl=pathToFileURL(patcherPath).href;
    const command='import('+JSON.stringify(entryUrl)+').then(m=>console.log(JSON.stringify({capturedSource:m.capturedSource,result:m.result,unrelatedResult:m.unrelatedResult}))).catch(e=>{console.error(e);process.exitCode=1});';
    const child=spawnSync(process.execPath,['--import',patcherUrl,'--input-type=module','-e',command],{
      cwd:root,encoding:'utf8'
    });
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout.trim());
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('unlisted proxy factory cannot expose a renamed function through numeric coercion',async()=>{
  const source=[
    "import {wrap} from 'proxy-package';",
    "function reader(secretValue){return secretValue+1;}",
    "const proxied=wrap(reader);",
    "const unrelatedPrivate=17;",
    "globalThis.__functionSources.length=0;",
    "export const result=Number.isNaN(+proxied);",
    "export const capturedSource=globalThis.__functionSources[0]??'';",
    "export const unrelatedResult=unrelatedPrivate;"
  ].join('\n');
  const output=obfuscateFiles([{path:'app.mjs',code:source}],{
    mode:'coo',seed:'external-proxy-factory-source',properties:false,
    strings:false,identifiers:true
  }).files[0];
  const native=await run(source);
  const transformed=await run(output.code);
  assert.equal(native.result,true);
  assert.equal(transformed.result,true);
  assert.equal(transformed.unrelatedResult,17);
  assert.ok(native.capturedSource.includes('secretValue'));
  assert.equal(transformed.capturedSource,native.capturedSource,
    'an unlisted proxy factory must not expose renamed target source');
  console.log(JSON.stringify({renamedBindings:output.metrics.bindings,codeChanged:output.code!==source}));
});
