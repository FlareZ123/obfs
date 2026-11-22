'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const esbuild=require('esbuild');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * A shared three-file ESM application with two candidate private keys.
 * @param {boolean} dynamicRead
 * @returns {ModuleFile[]}
 */
function graph(dynamicRead){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:17,otherField:5};'},
    {path:'identity.mjs',sourceType:'module',
      code:'export const identity=value=>value;'},
    {path:'entry.mjs',sourceType:'module',
      code:dynamicRead?
        'import {state} from "./state.mjs";'+
        'console.log(JSON.stringify(process.argv.slice(2).map(key=>state[key])));':
        'import {state} from "./state.mjs";'+
        'import {identity} from "./identity.mjs";'+
        'const record=identity(state);let total=0;'+
        'for(let index=0;index<2000;index++)'+
          'total=(total+record.secretField*index+record.otherField)|0;'+
        'console.log(JSON.stringify([total,record.secretField,record.otherField]));'}
  ];
}

/**
 * @param {string} root
 * @param {ModuleFile[]} files
 * @returns {Promise<void>}
 */
async function writeModules(root,files){
  for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
}

/**
 * Use one esbuild API call, enabling a consistent property mapping across all
 * three ESM entry points and all generated chunks. This is the explicit
 * property-mangling comparison esbuild documents, unlike minify:true alone.
 * @param {string} sourceRoot
 * @param {string} outputRoot
 * @returns {Promise<{code:string,cache:Record<string,string|false>}>}
 */
async function buildMangled(sourceRoot,outputRoot){
  const built=await esbuild.build({
    entryPoints:['entry.mjs','identity.mjs','state.mjs'].map(name=>
      path.join(sourceRoot,name)),
    bundle:true,splitting:true,platform:'node',format:'esm',
    outdir:outputRoot,outExtension:{'.js':'.mjs'},
    minify:true,mangleProps:/^(secretField|otherField)$/,
    mangleQuoted:true,mangleCache:{},write:false,logLevel:'silent'
  });
  assert.ok(built.outputFiles?.length);
  for(const output of built.outputFiles){
    const relative=path.relative(outputRoot,output.path);
    assert.ok(relative && relative!=='.'&&!relative.startsWith('..'));
    await atomicWrite(path.join(outputRoot,relative),
      Buffer.from(output.contents));
  }
  const code=built.outputFiles.map(output=>output.text).join('\n');
  return {code,cache:/** @type {Record<string,string|false>} */ (built.mangleCache??{})};
}

/**
 * @param {string} root
 * @param {string[]} [args]
 * @returns {string}
 */
function run(root,args=[]){
  const child=spawnSync(process.execPath,[path.join(root,'entry.mjs'),...args],{
    encoding:'utf8',timeout:15000
  });
  assert.equal(child.error,undefined,String(child.error));
  assert.equal(child.status,0,child.stderr);
  return child.stdout.trim();
}

/**
 * @param {boolean} dynamicRead
 * @returns {Promise<void>}
 */
async function checkMatchedMangleControl(dynamicRead){
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esbuild-mangle-'));
  try{
    const input=graph(dynamicRead);
    const nativeRoot=path.join(workspace,'native');
    const protectedRoot=path.join(workspace,'protected');
    const mangledRoot=path.join(workspace,'esbuild');
    const compiled=obfuscateFiles(input,{
      mode:'coo',closedWorld:true,seed:'esbuild-mangle-matched-v1',
      identifiers:false,strings:false,properties:true
    });
    await writeModules(nativeRoot,input);
    await writeModules(protectedRoot,
      /** @type {ModuleFile[]} */ (compiled.files));
    const {code:mangledCode,cache}=await buildMangled(nativeRoot,mangledRoot);
    const mangledKeys=['secretField','otherField'];
    for(const key of mangledKeys){
      assert.equal(typeof cache[key],'string',key);
      assert.notEqual(cache[key],key);
    }
    assert.doesNotMatch(mangledCode,/secretField|otherField/u);
    const protectedCode=compiled.files.map(file=>String(file.code)).join('\n');
    const args=dynamicRead?['secretField','otherField','missingField']:[];
    const nativeResult=run(nativeRoot,args);
    const protectedResult=run(protectedRoot,args);
    assert.equal(protectedResult,nativeResult,
      'Conservative compiler must preserve the original observable output');

    if(dynamicRead){
      assert.equal(compiled.crossFile.properties,0,
        'Unproved runtime field names must preserve the original keys');
      assert.notEqual(run(mangledRoot,args),nativeResult,
        'Explicitly mangling a dynamically referenced property changes behavior');
    }else{
      assert.equal(compiled.crossFile.properties,2);
      assert.doesNotMatch(protectedCode,/secretField|otherField/u);
      assert.equal(run(mangledRoot,args),nativeResult,
        'Matched mangling must preserve the static closed-world graph');
    }
  }finally{
    await fs.rm(workspace,{recursive:true,force:true});
  }
}

test('esbuild explicit property mangling matches private-name hiding on a safe three-module ESM graph',
  async()=>checkMatchedMangleControl(false));

test('dynamic property lookup separates a conservative proof from explicitly unsafe esbuild mangling',
  async()=>checkMatchedMangleControl(true));
