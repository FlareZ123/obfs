'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Run a real Node ESM graph in its own process. Ambient-global mutations in
 * the dependency cannot leak into the test runner or the next scenario.
 * @param {ModuleFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function runModuleGraph(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-string-intrinsic-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:10000
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

for(const [title,dependency] of [
  ['deleted global String binding','globalThis.String=undefined;'],
  ['modified global String.fromCharCode','globalThis.String.fromCharCode=()=>"?";'],
  ['direct global String assignment','String=undefined;']
]) {
  test('SNO/COO string encoding preserves earlier ESM dependency: '+title,async()=>{
    /** @type {ModuleFile[]} */
    const files=[
      {path:'side.mjs',sourceType:'module',code:dependency},
      {path:'entry.mjs',sourceType:'module',code:
        `import './side.mjs';process.stdout.write('protected-literal-value');`}
    ];
    const original=await runModuleGraph(files);
    assert.equal(original.status,0,original.stderr);
    assert.equal(original.stdout,'protected-literal-value');
    for(const mode of /** @type {const} */ (['coo','sno'])) {
      const transformed=obfuscateFiles(files,{
        mode,seed:'ambient-string-intrinsic/'+title,properties:false,identifiers:false,strings:true
      });
      const observed=await runModuleGraph(transformed.files);
      assert.equal(observed.status,0,mode+': '+observed.stderr);
      assert.equal(observed.stdout,original.stdout,mode+' changed the observable literal');
    }
  });
}
