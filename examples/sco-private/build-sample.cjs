'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {partitionScoAsyncModule}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

const SEED='example-sco-private-v1';

/**
 * Build the exact distributed client facade from the checked-in private
 * implementation. No environment secrets are evaluated or embedded while
 * constructing the facade.
 *
 * @returns {Promise<{client:string,publicPath:string,method:string}>}
 */
async function compileExample() {
  const privatePath=path.join(__dirname,'before-private.mjs');
  const privateSource=await fs.readFile(privatePath,'utf8');
  const partition=partitionScoAsyncModule({
    path:'public.mjs',sourceType:'module',code:privateSource
  },{seed:SEED,serverOnlyInitialization:true});
  return {
    client:partition.clientFile.code,
    publicPath:path.join(__dirname,'after-public.mjs'),
    method:partition.methodNames.derive
  };
}

/**
 * Recreate or verify the committed before/after example byte for byte.
 * @param {boolean} check
 * @returns {Promise<void>}
 */
async function buildSample(check=false) {
  const example=await compileExample();
  if(check) {
    assert.equal(await fs.readFile(example.publicPath,'utf8'),example.client,
      'Committed obfuscated client differs from the actual compiler output');
  } else {
    await atomicWrite(example.publicPath,example.client);
  }
}

if(require.main===module) {
  buildSample(process.argv.includes('--check')).catch(error=>{
    console.error(error);process.exitCode=1;
  });
}

module.exports={compileExample,buildSample,SEED};
