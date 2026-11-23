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

test('unlisted external Function#toString patch observes unary-plus coercion of a local function',async()=>{
  const source=[
    "import {install} from 'patcher';",
    "function reader(secretValue){return secretValue+1;}",
    "const unrelated=17;",
    "install();",
    "export const coercionIsNaN=Number.isNaN(+reader);",
    "export const capturedSource=globalThis.__functionSources[0]??'';",
    "export const result=unrelated;"
  ].join('\n');
  const output=obfuscateFiles([{path:'app.mjs',code:source}],{
    mode:'coo',seed:'external-unary-coercion',properties:false,
    strings:false,identifiers:true
  });
  assert.equal(output.files.length,1);
  const emitted=output.files[0].code;
  const patcher=[
    "const original=Function.prototype.toString;",
    "globalThis.__functionSources=[];",
    "Function.prototype.toString=function(){",
    "  const source=original.call(this);",
    "  globalThis.__functionSources.push(source);",
    "  return source;",
    "};",
    "export function install(){globalThis.__functionSources.length=0;}"
  ].join('\n');
  async function run(code){
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-unary-source-'));
    try{
      const packageDir=path.join(root,'node_modules','patcher');
      await fs.mkdir(packageDir,{recursive:true});
      await fs.writeFile(path.join(packageDir,'package.json'),
        JSON.stringify({type:'module',exports:'./index.mjs'}));
      await fs.writeFile(path.join(packageDir,'index.mjs'),patcher);
      await atomicWrite(path.join(root,'app.mjs'),code);
      const entryUrl=pathToFileURL(path.join(root,'app.mjs')).href;
      const command='import('+JSON.stringify(entryUrl)+').then(m=>console.log(JSON.stringify({coercionIsNaN:m.coercionIsNaN,capturedSource:m.capturedSource,result:m.result}))).catch(e=>{console.error(e);process.exitCode=1});';
      const child=spawnSync(process.execPath,['--input-type=module','-e',command],{
        cwd:root,encoding:'utf8'
      });
      assert.equal(child.status,0,child.stderr);
      return JSON.parse(child.stdout.trim());
    }finally{
      await fs.rm(root,{recursive:true,force:true});
    }
  }
  const native=await run(source);
  const transformed=await run(emitted);
  assert.equal(native.coercionIsNaN,true);
  assert.equal(transformed.coercionIsNaN,true);
  assert.equal(transformed.result,17);
  assert.equal(transformed.capturedSource,native.capturedSource,
    'an external patched Function#toString must observe the same function source');
  console.log(JSON.stringify({
    emittedChanged:emitted!==source,
    renamedBindings:output.files[0].metrics.bindings,
    nativeSource:native.capturedSource,
    emittedSource:transformed.capturedSource
  }));
});
