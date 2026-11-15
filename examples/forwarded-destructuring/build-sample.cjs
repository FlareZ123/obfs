'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {obfuscateFiles}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

/** @param {boolean} [check] @returns {Promise<string>} */
async function buildSample(check=false){
  const directory=__dirname;
  const source=await fs.readFile(path.join(directory,'before.cjs'),'utf8');
  const output=obfuscateFiles([
    {path:'sample.cjs',sourceType:'commonjs',code:source}
  ],{mode:'sno',seed:'forwarded-destructure-v1',identifiers:false,strings:false});
  assert.equal(output.files[0].metrics.objects,1);
  assert.equal(output.files[0].metrics.properties,2);
  const generated=/** @type {string} */ (output.files[0].code);
  const destination=path.join(directory,'after.cjs');
  if(check)assert.equal(await fs.readFile(destination,'utf8'),generated);
  else await atomicWrite(destination,generated);
  return generated;
}

if(require.main===module){
  buildSample(process.argv.includes('--check')).catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={buildSample};
