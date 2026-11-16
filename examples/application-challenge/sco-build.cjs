'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {partitionScoAsyncGraph}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

const ROOT=__dirname;
const SEED='application-challenge-sco-20261116';
const EXPOSED='sco-before/api.mjs';
const PRIVATE=[
  'before/private.mjs','before/reflect.mjs','before/host.mjs',
  'before/engine.mjs','before/app.mjs'
];

/** @returns {Promise<import('../../src/sco-graph').ScoGraphPartition>} */
async function build(){
  const files=await Promise.all([...PRIVATE,EXPOSED].map(async filename=>({
    path:filename,sourceType:/** @type {'module'} */ ('module'),
    code:await fs.readFile(path.join(ROOT,filename),'utf8')
  })));
  return partitionScoAsyncGraph(files,{seed:SEED,exposedPaths:[EXPOSED]});
}

/** @returns {Promise<void>} */
async function main(){
  const graph=await build();
  assert.deepEqual(graph.exposedPaths,[EXPOSED]);
  assert.deepEqual(graph.privatePaths,PRIVATE);
  assert.equal(graph.clientFiles.length,1);
  const output=graph.clientFiles[0];
  const target=path.join(ROOT,'sco-public',EXPOSED);
  if(process.argv.includes('--write'))await atomicWrite(target,output.code);
  else if(process.argv.includes('--check'))
    assert.equal(await fs.readFile(target,'utf8'),output.code,
      'Stale generated SCO client facade');
  else throw Error('Pass --check or --write');
  process.stdout.write('APPLICATION_SCO_BUILD '+JSON.stringify({
    publicPaths:graph.exposedPaths,
    privatePaths:graph.privatePaths,
    methodCount:Object.keys(graph.partitions[EXPOSED].methodNames).length,
    clientBytes:Buffer.byteLength(output.code),
    containsProtectedAlgorithm:output.code.includes('0x7feb352d')
  })+'\n');
  if(process.argv.includes('--dump'))
    process.stdout.write('APPLICATION_SCO_FACADE '+
      Buffer.from(output.code).toString('base64')+'\n');
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={build,SEED,EXPOSED,PRIVATE,ROOT};
