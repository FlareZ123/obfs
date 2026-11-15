'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {partitionScoSelectedAsyncExports}=require('../../src');
const {atomicWrite}=require('../../src/atomic');
const ROOT=__dirname;
const SEED='sco-selective-20261115-example';

/** @returns {Promise<import('../../src/sco-selective-partition').ScoSelectivePartition>} */
async function build() {
  const code=(await fs.readFile(path.join(ROOT,'before','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const partition=partitionScoSelectedAsyncExports({path:'mixed.mjs',code},
    {seed:SEED,privateNames:['protectedDigest']});
  await atomicWrite(path.join(ROOT,'after','mixed.mjs'),partition.clientFile.code);
  return partition;
}

if(require.main===module)build().then(partition=>{
  console.log(JSON.stringify({publicNames:partition.publicNames,privateNames:partition.privateNames}));
}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={build,SEED};
