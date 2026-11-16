'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {obfuscateFiles}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

const ROOT=__dirname;
const NAMES=['private.mjs','reflect.mjs','host.mjs','engine.mjs','app.mjs','entry.mjs'];
const SEED='application-challenge-frozen-20261116';

/** @returns {Promise<ReturnType<typeof obfuscateFiles>>} */
async function compile(){
  const files=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:/** @type {'module'} */ ('module'),
    code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  return obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:SEED,
    identifiers:true,properties:true,strings:false
  });
}

/** @returns {Promise<void>} */
async function main(){
  const output=await compile();
  for(const file of output.files){
    assert.equal(typeof file.code,'string');
    const target=path.join(ROOT,'after',file.path);
    if(process.argv.includes('--check')){
      assert.equal(await fs.readFile(target,'utf8'),file.code,
        'Stale actual compiled output: '+file.path);
    }else{
      await atomicWrite(target,file.code);
    }
  }
  const metrics={
    seed:SEED,
    files:output.files.length,
    crossFileProperties:output.crossFile.properties,
    localProperties:output.files.reduce((sum,file)=>sum+file.metrics.properties,0),
    originalSha256:createHash('sha256').update((await Promise.all(NAMES.map(
      name=>fs.readFile(path.join(ROOT,'before',name),'utf8')))).join('\0')).digest('hex'),
    emittedBytes:output.files.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0)
  };
  process.stdout.write('APP_CHALLENGE_METRICS '+JSON.stringify(metrics)+'\n');
  if(process.argv.includes('--dump')){
    for(const file of output.files){
      process.stdout.write('APP_CHALLENGE_EMITTED '+file.path+' '+
        Buffer.from(file.code).toString('base64')+'\n');
    }
  }
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={compile,NAMES,ROOT,SEED};
