'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {obfuscateFiles}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

/** @param {boolean} [check] @returns {Promise<ReturnType<typeof obfuscateFiles>>} */
async function buildSample(check=false) {
  const before=await Promise.all(['state.mjs','entry.mjs'].map(async name=>({
    path:name,sourceType:/** @type {'module'} */ ('module'),
    code:(await fs.readFile(path.join(__dirname,'before',name),'utf8')).replace(/\r\n?/gu,'\n')
  })));
  const output=obfuscateFiles(before,{
    mode:'coo',closedWorld:true,seed:'cross-factory-v1',strings:false,identifiers:false
  });
  assert.equal(output.crossFile.objects,1);
  assert.equal(output.crossFile.properties,2);
  for(const file of output.files) {
    const destination=path.join(__dirname,'after',file.path);
    if(check) {
      assert.equal((await fs.readFile(destination,'utf8')).replace(/\r\n?/gu,'\n'),file.code);
    } else await atomicWrite(destination,file.code);
  }
  return output;
}

if(require.main===module)buildSample(process.argv.includes('--check')).catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={buildSample};
