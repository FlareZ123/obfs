'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {lowerAffineNative}=require('../../src/affine-native');
const {atomicWrite}=require('../../src/atomic');

/**
 * Regenerate or byte-for-byte verify the committed compiler output.
 * @param {boolean} [check]
 * @returns {Promise<void>}
 */
async function buildSample(check=false) {
  const source=(await fs.readFile(path.join(__dirname,'before.cjs'),'utf8')).replace(/\r\n/gu,'\n');
  const output=lowerAffineNative(source,'commonjs',{
    seed:'affine-native-example-v1',names:['encode']
  });
  assert.equal(output.functions,1);
  assert.equal(output.steps,16);
  const target=path.join(__dirname,'after.cjs');
  if(check)assert.equal((await fs.readFile(target,'utf8')).replace(/\r\n/gu,'\n'),output.code);
  else await atomicWrite(target,output.code);
}

if(require.main===module)buildSample(process.argv.includes('--check')).catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={buildSample};
