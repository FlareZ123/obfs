'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'commonjs',code:string}} CommonJsFile */

/**
 * Execute the exact same file graph with or without an external Node preload.
 * The preload and redirected module are deliberately outside compiler input.
 * @param {CommonJsFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @param {CommonJsFile[]} external
 * @param {boolean} [useHook]
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files,external,useHook=true) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cjs-builtin-hook-'));
  try {
    for(const file of [...files,...external]) {
      await atomicWrite(path.join(directory,file.path),file.code);
    }
    const args=useHook?[
      '--import',pathToFileURL(path.join(directory,'preload.mjs')).href,
      path.join(directory,'entry.cjs')
    ]:[path.join(directory,'entry.cjs')];
    const child=spawnSync(process.execPath,args,{
      encoding:'utf8',timeout:15000,windowsHide:true
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @param {string} builtin @returns {CommonJsFile[]} */
function graph(builtin) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:'require('+JSON.stringify(builtin)+');process.stdout.write(require("./target.cjs"));'},
    {path:'target.cjs',sourceType:'commonjs',
      code:"module.exports='protected-literal-value';"}
  ];
}

const external=[
  {path:'preload.mjs',sourceType:'commonjs',
    code:[
      "import {registerHooks} from 'node:module';",
      "const redirected=new URL('./side.cjs',import.meta.url).href;",
      "registerHooks({",
      "  resolve(specifier,context,nextResolve) {",
      "    if(specifier==='path')return {url:redirected,shortCircuit:true};",
      "    return nextResolve(specifier,context);",
      "  }",
      "});"
    ].join('\n')},
  {path:'side.cjs',sourceType:'commonjs',
    code:'String.fromCharCode=()=>"?";module.exports={join(){return "redirected"}};'}
];

/**
 * This is an intentional negative control, not a production correctness
 * assertion: a caller-supplied Node resolver hook is outside the ordinary
 * builtin-resolution assumption. It records whether the compiler's
 * isBuiltin("path") exception admits a redirected bare builtin.
 */
test('bare CommonJS builtin can be redirected by a preloaded Node resolver hook',async()=>{
  const files=graph('path');
  const ordinaryNative=await execute(files,external,false);
  assert.deepEqual(ordinaryNative,{status:0,stdout:'protected-literal-value',stderr:''});
  const hookedNative=await execute(files,external,true);
  assert.deepEqual(hookedNative,ordinaryNative);

  for(const mode of /** @type {const} */ (['coo','sno'])) {
    const emitted=obfuscateFiles(files,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'cjs-builtin-hook/'+mode
    });
    const target=emitted.files.find(file=>file.path==='target.cjs');
    assert.ok((target?.metrics.literals??0)>0,
      mode+' did not exercise the admitted builtin-dependent decoder');
    assert.deepEqual(await execute(emitted.files,external,false),ordinaryNative,
      mode+' changed behavior under the ordinary Node resolver');
    const observed=await execute(emitted.files,external,true);
    assert.equal(observed.status,0,observed.stderr);
    assert.equal(observed.stdout,'?'.repeat('protected-literal-value'.length),
      mode+' did not expose the expected decoder corruption under the hook');
    assert.notDeepEqual(observed,hookedNative);
  }
});

/** The node: scheme control is not redirected by this hook. */
test('node-prefixed CommonJS builtin remains native under the same hook',async()=>{
  const files=graph('node:path');
  const ordinaryNative=await execute(files,external,false);
  assert.deepEqual(ordinaryNative,{status:0,stdout:'protected-literal-value',stderr:''});
  const hookedNative=await execute(files,external,true);
  assert.deepEqual(hookedNative,ordinaryNative);
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    const emitted=obfuscateFiles(files,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'cjs-node-builtin-control/'+mode
    });
    const target=emitted.files.find(file=>file.path==='target.cjs');
    assert.ok((target?.metrics.literals??0)>0);
    assert.deepEqual(await execute(emitted.files,external,false),ordinaryNative);
    assert.deepEqual(await execute(emitted.files,external,true),ordinaryNative);
  }
});
