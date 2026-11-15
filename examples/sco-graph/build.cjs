'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {partitionScoAsyncGraph}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

const SEED='agent31-graph-example-v1';
const EXPOSED=['api.mjs','audit.mjs'];
const ALL_FILES=['api.mjs','audit.mjs','secret.mjs'];

/** @returns {Promise<import('../../src/sco-graph').ScoGraphPartition>} */
async function build(){
  const files=await Promise.all(ALL_FILES.map(async filename=>({
    path:filename,sourceType:/** @type {'module'} */ ('module'),
    code:await fs.readFile(path.join(__dirname,'before',filename),'utf8')
  })));
  return partitionScoAsyncGraph(files,{seed:SEED,exposedPaths:EXPOSED});
}

/** @returns {Promise<void>} */
async function main(){
  const graph=await build();
  if(graph.clientFiles.length!==2||graph.privatePaths.join(',')!=='secret.mjs'){
    throw Error('Unexpected server-private publication surface');
  }
  const write=process.argv.includes('--write');
  if(!write&&!process.argv.includes('--check'))throw TypeError('Use --check or --write');
  for(const file of graph.clientFiles) {
    const destination=path.join(__dirname,'after',file.path);
    if(write)await atomicWrite(destination,file.code);
    else {
      const actual=await fs.readFile(destination,'utf8');
      if(actual!==file.code)throw Error('Generated public SCO graph facade is stale: '+file.path);
    }
  }
  process.stdout.write('SCO graph '+(write?'generated':'verified')+': '+
    graph.clientFiles.length+' public modules, '+graph.privatePaths.length+' private-only dependency.\n');
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={SEED,EXPOSED,build,main};
