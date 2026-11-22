'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Execute a consumer that receives only a primitive export; the class and its
 * instance remain local to the compiled module.
 * @param {SourceFile[]} files
 * @returns {Promise<string>}
 */
async function observe(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-class-yield-'));
  try {
    for(const file of files) {
      const target=path.join(root,file.path);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,String(file.code),'utf8');
    }
    const observerPath=path.join(root,'observer.mjs');
    await fs.writeFile(observerPath,
      'import {value} from "./private.mjs";console.log(String(value));','utf8');
    const child=spawnSync(process.execPath,[observerPath],{
      cwd:root,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('unescaped private class method retains positive identifier yield: '+mode,async()=>{
    const files=[{path:'private.mjs',sourceType:'module',code:
      'class PrivateApi{read(privateParam){return privateParam+9;}}const value=new PrivateApi().read(3);export {value};'}];
    const native=await observe(files);
    const transformed=obfuscateFiles(files,{
      mode,closedWorld:true,seed:'private-class-method-yield-'+mode,
      strings:false,properties:false,identifiers:true
    });
    const bindings=transformed.files.reduce((sum,file)=>sum+file.metrics.bindings,0);
    assert.ok(bindings>0,'a class that never escapes should not be blanket-frozen');
    assert.equal(await observe(transformed.files),native);
  });
}

module.exports={observe};
