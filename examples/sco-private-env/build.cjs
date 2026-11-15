'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {partitionScoSelectedAsyncExports}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

/** @returns {Promise<string>} */
async function build(){
  const before=(await fs.readFile(path.join(__dirname,'before','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const partition=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:before
  },{
    seed:'sco-private-env-20261115',
    privateNames:['protectedDigest'],allowServerEnvConstants:true
  });
  const code=partition.clientFile.code;
  await atomicWrite(path.join(__dirname,'after','mixed.mjs'),code);
  return code;
}

if(require.main===module)build().then(code=>process.stdout.write(code)).catch(error=>{
  console.error(error);
  process.exitCode=1;
});
module.exports={build};
