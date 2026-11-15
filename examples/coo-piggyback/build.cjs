'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {piggybackShards}=require('../../workplace/coo-piggyback-shards');

/** @param {boolean} [check] @returns {ReturnType<typeof piggybackShards>} */
function buildSample(check=true){
  const root=__dirname;
  /** @type {{path:string,code:string,sourceType:'module'}} */
  const consumer={path:'app.mjs',sourceType:'module',code:fs.readFileSync(path.join(root,'before/app.mjs'),'utf8')};
  /** @type {{path:string,code:string,sourceType:'module'}} */
  const donor={path:'constants.mjs',sourceType:'module',code:fs.readFileSync(path.join(root,'before/constants.mjs'),'utf8')};
  const result=piggybackShards({consumer,donor},{seed:'piggyback-public-sample-v1',functionName:'message',closedWorld:true});
  if(!result.transformed)throw new Error(result.reason);
  for(const file of result.files){
    const target=path.join(root,'after',file.path);
    if(check){
      if(fs.readFileSync(target,'utf8')!==file.code)throw new Error('Generated snapshot mismatch: '+file.path);
      continue;
    }
    fs.mkdirSync(path.dirname(target),{recursive:true});
    const lock=target+'.lock';
    const fd=fs.openSync(lock,'wx');
    const temp=target+'.tmp.'+process.pid;
    try{
      fs.writeFileSync(temp,file.code,'utf8');
      fs.renameSync(temp,target);
    }finally{
      if(fs.existsSync(temp))fs.unlinkSync(temp);
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }
  return result;
}
if(require.main===module){
  const write=process.argv.includes('--write');
  buildSample(!write);
  console.log(write?'Generated COO piggyback snapshots':'COO piggyback snapshots match');
}
module.exports={buildSample};
