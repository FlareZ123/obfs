'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {obfuscateFiles}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

/** @param {boolean} [check] @returns {Promise<string>} */
async function buildSample(check=false) {
  const original=(await fs.readFile(path.join(__dirname,'before.cjs'),'utf8')).replace(/\r\n?/gu,'\n');
  const output=obfuscateFiles([{path:'factory.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'factory-iife-v1',identifiers:false,strings:false
  });
  assert.equal(output.files[0].metrics.objects,1);
  assert.equal(output.files[0].metrics.properties,2);
  const code=/** @type {string} */ (output.files[0].code);
  const target=path.join(__dirname,'after.cjs');
  if(check)assert.equal((await fs.readFile(target,'utf8')).replace(/\r\n?/gu,'\n'),code);
  else await atomicWrite(target,code);
  return code;
}

if(require.main===module)buildSample(process.argv.includes('--check')).catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={buildSample};
