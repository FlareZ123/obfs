'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {atomicWrite}=require('../../src/atomic');
const {shardTopLevelStrings}=require('../../workplace/coo-shard-strings');

/** @returns {Promise<void>} */
async function main(){
  const base=__dirname;
  const source=await fs.readFile(path.join(base,'before','main.mjs'),'utf8');
  const result=shardTopLevelStrings({
    path:'examples/coo-shards/after/main.mjs',code:source,sourceType:'module'
  },{seed:'agent31-coo-sample-v1',names:['license','feature']});
  if(result.sharded!==2||result.files.length!==4)throw Error('Unexpected sample transform coverage');
  const write=process.argv.includes('--write');
  if(!write&&!process.argv.includes('--check')) {
    throw TypeError('Use --check or --write');
  }
  for(const file of result.files){
    const output=path.join(base,'after',path.basename(file.path));
    if(write)await atomicWrite(output,file.code);
    else {
      const actual=await fs.readFile(output,'utf8');
      if(actual!==file.code)throw Error('Generated sample is stale: '+output);
    }
  }
  process.stdout.write('COO sample '+(write?'generated':'verified')+': '+
    result.sharded+' string bindings, '+result.codeUnits+' UTF-16 code units, '+
    result.files.length+' output modules.\n');
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
